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
  '.env.example',
  'infra/docker-compose.dev.yml',
  'apps/api/package.json',
  'apps/api/prisma/schema.prisma',
  'apps/web/package.json',
  'packages/config/package.json',
  'packages/config/src/index.ts',
  'packages/contracts/package.json',
  'packages/contracts/src/index.ts',
  'tests/evals/n1-safe-unavailable.json',
  'scripts/run-release-rehearsal.mjs',
  'tests/evals/n12-release-rehearsal.json',
  'tests/fixtures/release-rehearsal-published.md',
  'config/business-readiness/synthetic-local-eval.json',
  'config/business-readiness/synthetic-release-rehearsal.json',
  'scripts/readiness-check.mjs',
  'tests/evals/n13-business-readiness.json',
  'tests/evals/run-n13-eval.mjs',
  'tests/evals/n14-business-readiness.json',
  'tests/evals/run-n14-eval.mjs',
  'docs/adr/0012-N14-synthetic-knowledge-fixture-contract.md',
  'docs/N14-acceptance.md',
  'packages/config/src/release-readiness.ts',
  'scripts/release-readiness.mjs',
  'tests/evals/n15-release-readiness.json',
  'tests/evals/run-n15-eval.mjs',
  'docs/adr/0013-N15-production-readiness-and-rehearsal.md',
  'docs/N15-acceptance.md',
  'docs/adr/0010-N12合成发布演练与回滚.md',
  'docs/N12验收记录.md',
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

if (failures.length > 0) {
  console.error('Project verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Project verification passed: ${requiredFiles.length} base files and ${roleFiles.length} role files checked.`);
}
