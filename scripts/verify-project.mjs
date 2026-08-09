import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const requiredFiles = [
  'AGENTS.md',
  'apps/api/AGENTS.md',
  'apps/web/AGENTS.md',
  'packages/contracts/AGENTS.md',
  'tests/AGENTS.md',
  '.gitignore',
  '.gitattributes',
  '.editorconfig',
  '.codex/config.toml',
  'package.json',
  'pnpm-workspace.yaml',
  'tsconfig.base.json',
  'eslint.config.mjs',
  'prettier.config.mjs',
];
const roleFiles = [
  'project-manager.toml',
  'product-manager.toml',
  'solution-architect.toml',
  'backend-engineer.toml',
  'frontend-engineer.toml',
  'ai-engineer.toml',
  'qa-engineer.toml',
  'security-reviewer.toml',
].map((file) => path.join('.codex', 'agents', file));

const failures = [];
const read = (relativePath) => {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`missing: ${relativePath}`);
    return '';
  }
  return fs.readFileSync(absolutePath, 'utf8');
};

for (const file of requiredFiles) read(file);

for (const file of roleFiles) {
  const content = read(file);
  for (const field of ['name', 'description', 'developer_instructions']) {
    if (!new RegExp(`^${field}\\s*=`, 'm').test(content)) {
      failures.push(`role field missing: ${file} -> ${field}`);
    }
  }
  if (/sk-[A-Za-z0-9_-]{10,}/.test(content) || /api[_-]?key\s*=/i.test(content)) {
    failures.push(`possible secret in role file: ${file}`);
  }
}

const packageJson = JSON.parse(read('package.json'));
if (packageJson.private !== true) failures.push('package.json must remain private during bootstrap');
if (packageJson.scripts?.verify !== 'node scripts/verify-project.mjs') {
  failures.push('package.json verify script is not configured');
}

const config = read('.codex/config.toml');
if (!/^\[agents\]/m.test(config) || !/^enabled\s*=\s*true/m.test(config)) {
  failures.push('.codex/config.toml must enable agents');
}
if (!/^max_concurrent_threads_per_session\s*=\s*4/m.test(config)) {
  failures.push('.codex/config.toml must cap concurrency at 4');
}

const forbiddenBootstrapPaths = [
  'apps/api/src',
  'apps/web/src',
  'packages/contracts/src',
  'tests/unit',
  'tests/integration',
  'tests/e2e',
];
for (const relativePath of forbiddenBootstrapPaths) {
  if (fs.existsSync(path.join(root, relativePath))) {
    failures.push(`N0 must not create business implementation path: ${relativePath}`);
  }
}

if (failures.length > 0) {
  console.error('Project verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Project verification passed: ${requiredFiles.length} base files and ${roleFiles.length} role files checked.`);
}

