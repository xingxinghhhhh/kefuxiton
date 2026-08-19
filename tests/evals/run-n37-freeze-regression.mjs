import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const baselineCommit = '2b8a473';
const manifestPath = 'tests/evals/n34-freeze-manifest.json';
const n35CasesPath = 'tests/evals/n35-synthetic-knowledge-modes.json';
const n36CasesPath = 'tests/evals/n36-freeze-maintenance.json';
const n34RootKeys = [
  'schemaVersion', 'evidenceType', 'nodeOrder', 'expectedNodeCount', 'items', 'readiness',
  'productionBlockers', 'productionFreeze', 'syntheticOnly', 'productionIntegration', 'manifestDigest',
];
const n34ItemKeys = ['nodeId', 'evidenceKind', 'acceptanceStatus', 'evalCount', 'rehearsalRuns', 'evidenceDigest'];
const n34FreezeKeys = ['status', 'authorization', 'realInputs'];
const nodeOrder = ['N29', 'N30', 'N31', 'N32', 'N33', 'N33-R1'];
const productionBlockers = [
  'BUSINESS_NOT_PRODUCTION_READY',
  'KNOWLEDGE_SOURCE_NOT_APPROVED',
  'SYNTHETIC_NOT_PRODUCTION',
  'STAFF_IDENTITY_NOT_CONFIGURED',
  'AGENT_PROVIDER_NOT_CONFIGURED',
  'DEPLOYMENT_TARGET_NOT_CONFIGURED',
];
const n35CaseIds = [
  'N35-PACKAGE-ID', 'N35-SOURCE-ID', 'N35-SOURCE-STATUS', 'N35-CONTENT-HASH', 'N35-CANONICAL-HASH',
  'N35-LOCAL-EVAL-IMPORT', 'N35-LOCAL-EVAL-NOT-PUBLISHED', 'N35-LOCAL-EVAL-NOT-RETRIEVABLE', 'N35-LOCAL-EVAL-CLEANUP',
  'N35-REHEARSAL-IMPORT', 'N35-REHEARSAL-KNOWLEDGE-ANSWER', 'N35-REHEARSAL-CITATION', 'N35-REHEARSAL-SAFE-BOUNDARY',
  'N35-PRODUCTION-READINESS-REJECT', 'N35-PRODUCTION-NO-DB-WRITE', 'N35-PRODUCTION-NO-LISTEN',
  'N35-OUTPUT-REDACTION', 'N35-RESOURCE-CLEANUP',
];
const n36CaseIds = [
  'N36-N34-EXACT-KEYS', 'N36-N34-NODE-ORDER', 'N36-N34-ITEM-COUNTS', 'N36-N34-DIGEST',
  'N36-FREEZE-STATUS', 'N36-FREEZE-AUTHORIZATION', 'N36-FREEZE-REAL-INPUTS',
  'N36-READINESS-LOCAL-EVAL', 'N36-READINESS-REHEARSAL', 'N36-READINESS-PRODUCTION',
  'N36-PRODUCTION-BLOCKERS', 'N36-N35-TRI-MODE', 'N36-N35-REGRESSION', 'N36-FILE-BOUNDARY', 'N36-OUTPUT-REDACTION',
];
const allowedFiles = new Set([
  'tests/evals/n37-freeze-regression.json', 'tests/evals/run-n37-freeze-regression.mjs',
  'docs/adr/0035-N37非生产冻结基线定期回归.md', 'docs/N37-acceptance.md', 'docs/运行手册.md', 'package.json',
]);
function readText(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function assert(condition) {
  if (!condition) throw new Error('N37 assertion failed');
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function readBaseline(relativePath) {
  const result = spawnSync('git', ['show', `${baselineCommit}:${relativePath}`], { cwd: root, encoding: null, windowsHide: true });
  assert(result.status === 0);
  return result.stdout;
}

function withoutDigest(manifest) {
  const { manifestDigest: _manifestDigest, ...content } = manifest;
  return content;
}

function runReadiness(target) {
  const packageManager = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const result = spawnSync(packageManager, ['release:readiness', `--target=${target}`], {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    windowsHide: true,
    env: {
      ...process.env,
      APP_ENV: target,
      WEB_ORIGIN: target === 'production' ? 'https://support.example.test' : 'http://localhost:3000',
      NEXT_PUBLIC_API_BASE_URL: target === 'production' ? 'https://api.example.test/api/v1' : 'http://localhost:3001/api/v1',
      STAFF_AUTH_MODE: 'deny',
      ALLOW_KNOWLEDGE_PUBLISH: '0',
    },
  });
  const line = `${result.stdout ?? ''}`.trim().split(/\r?\n/u).filter((value) => value.startsWith('{')).at(-1);
  assert(line);
  return { exitCode: result.status, report: JSON.parse(line) };
}

function changedFilesSinceBaseline() {
  const tracked = spawnSync('git', ['diff', '--name-only', '-z', baselineCommit], { cwd: root, encoding: 'utf8', windowsHide: true });
  const untracked = spawnSync('git', ['status', '--porcelain=v1', '-z'], { cwd: root, encoding: 'utf8', windowsHide: true });
  assert(tracked.status === 0 && untracked.status === 0);
  const trackedFiles = `${tracked.stdout ?? ''}`.split('\0').filter(Boolean);
  const untrackedFiles = `${untracked.stdout ?? ''}`.split('\0').filter(Boolean).map((entry) => entry.slice(3));
  return [...new Set([...trackedFiles, ...untrackedFiles])];
}

function createDependencyView(worktreePath) {
  const source = join(root, 'node_modules');
  const destination = join(worktreePath, 'node_modules');
  mkdirSync(destination, { recursive: true });
  for (const entry of readdirSync(source)) {
    const sourcePath = join(source, entry);
    const destinationPath = join(destination, entry);
    if (entry === '.pnpm' || entry === '.bin') {
      symlinkSync(sourcePath, destinationPath, 'junction');
    } else if (entry.startsWith('.') && (entry.endsWith('.yaml') || entry.endsWith('.json'))) {
      writeFileSync(destinationPath, readFileSync(sourcePath, 'utf8').replaceAll(root, worktreePath));
    } else {
      symlinkSync(sourcePath, destinationPath, 'junction');
    }
  }
}

function createPackageDependencyView(source, destination, overrides = {}) {
  mkdirSync(destination, { recursive: true });
  for (const entry of readdirSync(source)) {
    const destinationPath = join(destination, entry);
    if (entry === '.prisma') continue;
    const override = overrides[entry];
    if (override) {
      mkdirSync(destinationPath, { recursive: true });
      for (const [name, target] of Object.entries(override)) {
        symlinkSync(target, join(destinationPath, name), 'junction');
      }
      continue;
    }
    symlinkSync(join(source, entry), destinationPath, 'junction');
  }
}

function runHostedN36() {
  const revision = spawnSync('git', ['rev-parse', `${baselineCommit}^{commit}`], { cwd: root, encoding: 'utf8', windowsHide: true });
  assert(revision.status === 0 && /^[a-f0-9]{40}\r?\n$/u.test(revision.stdout));
    const worktreePath = mkdtempSync(join(root, '.n37-n36-baseline-'));
  rmSync(worktreePath, { recursive: true, force: true });
  const relativeWorktreePath = worktreePath.slice(root.length + 1);
  let worktreeAdded = false;
  try {
    const added = spawnSync('git', ['worktree', 'add', '--detach', relativeWorktreePath, baselineCommit], {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
    });
    assert(added.status === 0);
    worktreeAdded = true;
    const linkedDirectories = [
      ['apps/api/dist', join(root, 'apps/api/dist')],
    ];
    for (const [relativeLink, target] of linkedDirectories) {
      symlinkSync(target, join(worktreePath, relativeLink), 'junction');
    }
    createDependencyView(worktreePath);
    createPackageDependencyView(
      join(root, 'apps/api/node_modules'),
      join(worktreePath, 'apps/api/node_modules'),
      { '@ai-agent': { config: join(worktreePath, 'packages/config'), contracts: join(worktreePath, 'packages/contracts') } },
    );
    createPackageDependencyView(
      join(root, 'packages/config/node_modules'),
      join(worktreePath, 'packages/config/node_modules'),
    );
    createPackageDependencyView(
      join(root, 'packages/contracts/node_modules'),
      join(worktreePath, 'packages/contracts/node_modules'),
    );
    createPackageDependencyView(
      join(root, 'packages/langgraph-lab/node_modules'),
      join(worktreePath, 'packages/langgraph-lab/node_modules'),
    );
    const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: worktreePath, encoding: 'utf8', windowsHide: true });
    assert(head.status === 0 && head.stdout === revision.stdout);
    const packageInstall = spawnSync('pnpm.cmd', ['install', '--frozen-lockfile'], {
      cwd: worktreePath,
      encoding: 'utf8',
      shell: true,
      timeout: 240_000,
      windowsHide: true,
      env: { ...process.env, CI: 'true' },
    });
    assert(packageInstall.status === 0 && !packageInstall.error);
    const prisma = spawnSync('.\\node_modules\\.bin\\prisma.cmd', ['generate'], {
      cwd: join(worktreePath, 'apps/api'),
      encoding: 'utf8',
      shell: process.platform === 'win32',
      timeout: 180_000,
      windowsHide: true,
      env: { ...process.env },
    });
    assert(prisma.status === 0 && !prisma.error);
    const result = spawnSync(process.execPath, ['--no-warnings', 'tests/evals/run-n36-eval.mjs'], {
      cwd: worktreePath,
      encoding: 'utf8',
      timeout: 360_000,
      windowsHide: true,
      env: { ...process.env },
    });
    assert(result.status === 0 && !result.error);
    const events = `${result.stdout ?? ''}`.split(/\r?\n/u).flatMap((line) => {
      try {
        const value = JSON.parse(line);
        return value.status === 'passed' && typeof value.caseId === 'string' ? [value.caseId] : [];
      } catch {
        return [];
      }
    });
    assert(events.length === 15 && events.every((caseId) => caseId.startsWith('N36-')));
    console.log(JSON.stringify({ caseId: 'N37-N36-BASELINE-RUN', status: 'passed', reasonCode: 'NONE' }));
  } catch {
    throw new Error('N37 baseline regression execution failed');
  } finally {
    let cleanupError = null;
    if (worktreeAdded) {
      const removed = spawnSync('git', ['worktree', 'remove', '--force', relativeWorktreePath], {
        cwd: root,
        encoding: 'utf8',
        windowsHide: true,
      });
      if (removed.status !== 0) {
        cleanupError = new Error('N37 baseline worktree cleanup failed');
      }
    }
    try {
      rmSync(worktreePath, { recursive: true, force: true });
    } catch {
      cleanupError = new Error('N37 baseline worktree cleanup failed');
    }
    if (cleanupError) throw cleanupError;
  }
}

function assertOutputContract(source, bootstrapCaseId) {
  assert(source.includes("JSON.stringify({ caseId, status: 'passed', reasonCode: 'NONE' })"));
  assert(source.includes(`caseId: '${bootstrapCaseId}'`));
  assert(!/console\.log\((?:error|stack)|console\.error/iu.test(source));
}

function safeCase(caseId, callback) {
  try {
    callback();
    console.log(JSON.stringify({ caseId, status: 'passed', reasonCode: 'NONE' }));
  } catch {
    console.log(JSON.stringify({ caseId, status: 'failed', reasonCode: 'N37_EVAL_FAILED' }));
    process.exitCode = 1;
  }
}

try {
  const regression = readJson('tests/evals/n37-freeze-regression.json');
  const manifest = readJson(manifestPath);
  const n35Cases = readJson(n35CasesPath);
  const n36Cases = readJson(n36CasesPath);
  const n37Source = readText('tests/evals/run-n37-freeze-regression.mjs');
  const n35Source = readText('tests/evals/run-n35-eval.mjs');
  const n36Source = readText('tests/evals/run-n36-eval.mjs');
  const packageJson = readJson('package.json');
  const runbook = readText('docs/运行手册.md');

  runHostedN36();

  assert(regression.schemaVersion === 'n37.freeze-regression.v1');
  assert(regression.baselineCommit === baselineCommit);
  assert(Array.isArray(regression.baselineFiles) && regression.baselineFiles.length === 3);
  assert(Array.isArray(regression.cases) && regression.cases.length === 15);
  assert(new Set(regression.cases.map((testCase) => testCase.id)).size === 15);
  assert(JSON.stringify(regression.cases.map((testCase) => testCase.id)) === JSON.stringify([
    'N37-N34-EXACT-KEYS', 'N37-N34-NODE-ORDER', 'N37-N34-DIGEST', 'N37-N34-FREEZE',
    'N37-N35-CASE-COUNT', 'N37-N35-CASE-ALLOWLIST', 'N37-N35-OUTPUT-CONTRACT',
    'N37-N36-CASE-COUNT', 'N37-N36-CASE-ALLOWLIST', 'N37-N36-OUTPUT-CONTRACT',
    'N37-READINESS-LOCAL-EVAL', 'N37-READINESS-REHEARSAL', 'N37-READINESS-PRODUCTION',
    'N37-FILE-BOUNDARY', 'N37-OUTPUT-REDACTION',
  ]));

  safeCase('N37-N34-EXACT-KEYS', () => {
    assert(JSON.stringify(Object.keys(manifest)) === JSON.stringify(n34RootKeys));
    assert(manifest.items.every((item) => JSON.stringify(Object.keys(item)) === JSON.stringify(n34ItemKeys)));
    assert(JSON.stringify(Object.keys(manifest.productionFreeze)) === JSON.stringify(n34FreezeKeys));
  });
  safeCase('N37-N34-NODE-ORDER', () => {
    assert(manifest.schemaVersion === 'n34.v1');
    assert(JSON.stringify(manifest.nodeOrder) === JSON.stringify(nodeOrder));
    assert(manifest.expectedNodeCount === 6 && manifest.items.length === 6);
  });
  safeCase('N37-N34-DIGEST', () => {
    const baseline = regression.baselineFiles.find((file) => file.path === manifestPath);
    assert(baseline?.sha256 === sha256(readBaseline(manifestPath)));
    assert(baseline.sha256 === sha256(Buffer.from(readText(manifestPath), 'utf8')));
    assert(sha256(JSON.stringify(withoutDigest(manifest))) === manifest.manifestDigest);
  });
  safeCase('N37-N34-FREEZE', () => {
    assert(JSON.stringify(manifest.productionFreeze) === JSON.stringify({
      status: 'FROZEN', authorization: 'NOT_GRANTED', realInputs: 'NOT_AVAILABLE',
    }));
    assert(manifest.syntheticOnly === true && manifest.productionIntegration === false);
  });
  safeCase('N37-N35-CASE-COUNT', () => assert(n35Cases.length === 18));
  safeCase('N37-N35-CASE-ALLOWLIST', () => assert(JSON.stringify(n35Cases.map((testCase) => testCase.id)) === JSON.stringify(n35CaseIds)));
  safeCase('N37-N35-OUTPUT-CONTRACT', () => assertOutputContract(n35Source, 'N35-BOOTSTRAP'));
  safeCase('N37-N36-CASE-COUNT', () => assert(n36Cases.length === 15));
  safeCase('N37-N36-CASE-ALLOWLIST', () => assert(JSON.stringify(n36Cases.map((testCase) => testCase.id)) === JSON.stringify(n36CaseIds)));
  safeCase('N37-N36-OUTPUT-CONTRACT', () => assertOutputContract(n36Source, 'N36-BOOTSTRAP'));
  safeCase('N37-READINESS-LOCAL-EVAL', () => {
    const result = runReadiness('local_eval');
    assert(result.exitCode === 0 && result.report.status === 'LOCAL_EVAL_READY' && result.report.reasonCodes.length === 0);
  });
  safeCase('N37-READINESS-REHEARSAL', () => {
    const result = runReadiness('rehearsal');
    assert(result.exitCode === 0 && result.report.status === 'REHEARSAL_READY' && result.report.reasonCodes.length === 0);
  });
  safeCase('N37-READINESS-PRODUCTION', () => {
    const result = runReadiness('production');
    assert(result.exitCode === 1 && result.report.status === 'NOT_READY');
    assert(JSON.stringify(result.report.reasonCodes) === JSON.stringify(productionBlockers));
  });
  safeCase('N37-FILE-BOUNDARY', () => {
    assert(changedFilesSinceBaseline().every((file) => allowedFiles.has(file)));
    assert(!changedFilesSinceBaseline().some((file) => file === manifestPath || file === n35CasesPath || file === n36CasesPath));
    assert(packageJson.scripts['test:langgraph-lab'].includes('run-n37-freeze-regression.mjs'));
    assert(runbook.includes('N37'));
    const imports = [...n37Source.matchAll(/from\s+'([^']+)'/gu)].map((match) => match[1]);
    assert(imports.length === 5 && imports.every((specifier) => specifier.startsWith('node:')));
  });
  safeCase('N37-OUTPUT-REDACTION', () => {
    const serialized = JSON.stringify(regression);
    assert(!/(?:postgres(?:ql)?:\/\/|[A-Z]:\\|[A-Z]:\/(?!\/)|node_modules|stack trace)/iu.test(serialized));
    assert(n37Source.includes("JSON.stringify({ caseId, status: 'passed', reasonCode: 'NONE' })"));
    assert(n37Source.includes("caseId: 'N37-N36-BASELINE-RUN'"));
    assert(!/console\.log\((?:error|stack)|console\.error/iu.test(n37Source));
  });

  if (process.exitCode) process.exit(1);
} catch {
  console.log(JSON.stringify({ caseId: 'N37-BOOTSTRAP', status: 'failed', reasonCode: 'N37_EVAL_FAILED' }));
  process.exitCode = 1;
}
