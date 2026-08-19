import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const packageManager = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const baselineCommit = '2b8a473';
const n36CasesPath = 'tests/evals/n36-freeze-maintenance.json';
const n37CasePath = 'tests/evals/n37-freeze-regression.json';
const n37SourcePath = 'tests/evals/run-n37-freeze-regression.mjs';
const n37Files = [
  n37CasePath,
  n37SourcePath,
  'docs/adr/0035-N37非生产冻结基线定期回归.md',
  'docs/N37-acceptance.md',
];
const allowedFiles = new Set([
  ...n37Files,
  'tests/evals/n38-freeze-determinism.json',
  'tests/evals/run-n38-freeze-determinism.mjs',
  'docs/adr/0036-N38冻结基线回归确定性与漂移门禁.md',
  'docs/N38-acceptance.md',
  'docs/运行手册.md',
  'package.json',
]);
const expectedN36CaseIds = [
  'N36-N34-EXACT-KEYS', 'N36-N34-NODE-ORDER', 'N36-N34-ITEM-COUNTS', 'N36-N34-DIGEST',
  'N36-FREEZE-STATUS', 'N36-FREEZE-AUTHORIZATION', 'N36-FREEZE-REAL-INPUTS',
  'N36-READINESS-LOCAL-EVAL', 'N36-READINESS-REHEARSAL', 'N36-READINESS-PRODUCTION',
  'N36-PRODUCTION-BLOCKERS', 'N36-N35-TRI-MODE', 'N36-N35-REGRESSION', 'N36-FILE-BOUNDARY', 'N36-OUTPUT-REDACTION',
];
const expectedN37CaseIds = [
  'N37-N34-EXACT-KEYS', 'N37-N34-NODE-ORDER', 'N37-N34-DIGEST', 'N37-N34-FREEZE',
  'N37-N35-CASE-COUNT', 'N37-N35-CASE-ALLOWLIST', 'N37-N35-OUTPUT-CONTRACT',
  'N37-N36-CASE-COUNT', 'N37-N36-CASE-ALLOWLIST', 'N37-N36-OUTPUT-CONTRACT',
  'N37-READINESS-LOCAL-EVAL', 'N37-READINESS-REHEARSAL', 'N37-READINESS-PRODUCTION',
  'N37-FILE-BOUNDARY', 'N37-OUTPUT-REDACTION',
];
const frozenN37Hashes = {
  [n37CasePath]: '0421c82317a93331e35e9d268c0d45e833bc1e3e29ad5f282c372ce314e6dcdf',
  [n37SourcePath]: 'd1823853fb6e85a63799e54c6c453a49a145eb1bfe69ed59c9b7681391e3798f',
  'docs/N37-acceptance.md': 'afa4f477dd0e5558f4c2f771a16618ea4fee8c7839a9d8621a83ac2ee5bd5295',
  'docs/adr/0035-N37非生产冻结基线定期回归.md': '37458eb07ff0fbbbbd67dd06d7b514b9bfa39e671d114f3ac08c50691725357f',
};

function readText(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function assert(condition) {
  if (!condition) throw new Error('N38 assertion failed');
}

function fail(code) {
  throw new Error(code);
}

function sha256(relativePath) {
  return createHash('sha256').update(readFileSync(join(root, relativePath))).digest('hex');
}

function changedFilesSinceBaseline() {
  const tracked = spawnSync('git', ['diff', '--name-only', '-z', baselineCommit], { cwd: root, encoding: 'utf8', windowsHide: true });
  const untracked = spawnSync('git', ['status', '--porcelain=v1', '-z'], { cwd: root, encoding: 'utf8', windowsHide: true });
  assert(tracked.status === 0 && untracked.status === 0);
  const trackedFiles = `${tracked.stdout ?? ''}`.split('\0').filter(Boolean);
  const untrackedFiles = `${untracked.stdout ?? ''}`.split('\0').filter(Boolean).map((entry) => entry.slice(3));
  return [...new Set([...trackedFiles, ...untrackedFiles])];
}

function copyN37Overlay(worktreePath) {
  for (const relativePath of [...n37Files, 'docs/运行手册.md', 'package.json']) {
    const destination = join(worktreePath, relativePath);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(join(root, relativePath), destination);
  }
}

function prepareN37ClonePackage(clonePath) {
  const packageJson = readJson('package.json');
  packageJson.scripts['test:langgraph-lab'] = `${packageJson.scripts['test:langgraph-lab']} && node tests/evals/run-n37-freeze-regression.mjs`;
  writeFileSync(join(clonePath, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`);
}

function parseSafeEvents(output) {
  return `${output ?? ''}`.split(/\r?\n/u).flatMap((line) => {
    try {
      const event = JSON.parse(line);
      if (event && typeof event.caseId === 'string' && event.status === 'passed' && event.reasonCode === 'NONE') {
        return [{ caseId: event.caseId, status: event.status, reasonCode: event.reasonCode }];
      }
      return [];
    } catch {
      return [];
    }
  });
}

function runN37Once() {
  const clonePath = mkdtempSync(join(root, '..', '..', 'n38-'));
  rmSync(clonePath, { recursive: true, force: true });
  let cloneCreated = false;
  try {
    const cloned = spawnSync('git', ['clone', '--no-local', '--no-checkout', root, clonePath], {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
    });
    if (cloned.status !== 0 || cloned.error) fail('N38_BASELINE_CLONE_FAILED');
    cloneCreated = true;
    const checkout = spawnSync('git', ['checkout', '--detach', baselineCommit], {
      cwd: clonePath,
      encoding: 'utf8',
      windowsHide: true,
    });
    if (checkout.status !== 0 || checkout.error) fail('N38_BASELINE_CLONE_FAILED');
    copyN37Overlay(clonePath);
    prepareN37ClonePackage(clonePath);
    const packageInstall = spawnSync(packageManager, ['install', '--frozen-lockfile'], {
      cwd: clonePath,
      encoding: 'utf8',
      shell: process.platform === 'win32',
      timeout: 240_000,
      windowsHide: true,
      env: { ...process.env, CI: 'true' },
    });
    if (packageInstall.status !== 0 || packageInstall.error) fail('N38_BASELINE_CLONE_FAILED');
    symlinkSync(join(root, 'apps/api/dist'), join(clonePath, 'apps/api/dist'), 'junction');
    const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: clonePath, encoding: 'utf8', windowsHide: true });
    const revision = spawnSync('git', ['rev-parse', `${baselineCommit}^{commit}`], { cwd: root, encoding: 'utf8', windowsHide: true });
    if (head.status !== 0 || revision.status !== 0 || head.stdout.trim() !== revision.stdout.trim()) fail('N38_BASELINE_CLONE_FAILED');
    const result = spawnSync(process.execPath, ['--no-warnings', 'tests/evals/run-n37-freeze-regression.mjs'], {
      cwd: clonePath,
      encoding: 'utf8',
      timeout: 420_000,
      windowsHide: true,
      env: { ...process.env },
    });
    if (result.status !== 0 || result.error) fail('N38_N37_FAILED');
    const events = parseSafeEvents(result.stdout);
    const expected = ['N37-N36-BASELINE-RUN', ...expectedN37CaseIds];
    if (events.length !== expected.length || JSON.stringify(events.map((event) => event.caseId)) !== JSON.stringify(expected)) fail('N38_N37_FAILED');
    return JSON.stringify({ baselineCommit, n37: events });
  } finally {
    let cleanupError = null;
    try {
      if (cloneCreated) rmSync(clonePath, { recursive: true, force: true });
      if (existsSync(clonePath)) cleanupError = new Error('N38_CLEANUP_FAILED');
    } catch {
      cleanupError = new Error('N38_CLEANUP_FAILED');
    }
    if (cleanupError) throw cleanupError;
  }
}

function safeCase(caseId, callback) {
  try {
    callback();
    console.log(JSON.stringify({ caseId, status: 'passed', reasonCode: 'NONE' }));
  } catch {
    console.log(JSON.stringify({ caseId, status: 'failed', reasonCode: 'N38_EVAL_FAILED' }));
    process.exitCode = 1;
  }
}

try {
  const regression = readJson('tests/evals/n38-freeze-determinism.json');
  const n36Cases = readJson(n36CasesPath);
  const n37Source = readText(n37SourcePath);
  const packageJson = readJson('package.json');
  const runbook = readText('docs/运行手册.md');
  let firstSummary;
  let secondSummary;

  safeCase('N38-BASELINE-COMMIT', () => {
    const revision = spawnSync('git', ['rev-parse', `${baselineCommit}^{commit}`], { cwd: root, encoding: 'utf8', windowsHide: true });
    assert(revision.status === 0 && /^[a-f0-9]{40}\r?\n?$/u.test(revision.stdout));
    assert(regression.schemaVersion === 'n38.freeze-determinism.v1' && regression.baselineCommit === baselineCommit);
  });
  safeCase('N38-N36-CASE-COUNT', () => assert(n36Cases.length === 15));
  safeCase('N38-N36-CASE-ALLOWLIST', () => assert(JSON.stringify(n36Cases.map((testCase) => testCase.id)) === JSON.stringify(expectedN36CaseIds)));
  safeCase('N38-FIRST-RUN', () => { firstSummary = runN37Once(); });
  safeCase('N38-SECOND-RUN', () => { secondSummary = runN37Once(); });
  safeCase('N38-SUMMARY-DETERMINISM', () => {
    assert(typeof firstSummary === 'string' && firstSummary === secondSummary);
    const summary = JSON.parse(firstSummary);
    assert(summary.baselineCommit === baselineCommit);
    assert(summary.n37.length === 16 && summary.n37.filter((event) => event.caseId.startsWith('N36-')).length === 0);
    assert(summary.n37.some((event) => event.caseId === 'N37-N36-BASELINE-RUN'));
    assert(summary.n37.filter((event) => event.caseId.startsWith('N37-') && event.caseId !== 'N37-N36-BASELINE-RUN').length === 15);
  });
  safeCase('N38-FILE-BOUNDARY', () => {
    assert(changedFilesSinceBaseline().every((file) => allowedFiles.has(file)));
    assert(n37Files.every((file) => sha256(file) === frozenN37Hashes[file]));
    assert(!packageJson.scripts['test:langgraph-lab'].includes('run-n37-freeze-regression.mjs'));
    assert(packageJson.scripts['test:langgraph-lab'].includes('run-n38-freeze-determinism.mjs'));
    assert(runbook.includes('N37') && runbook.includes('N38'));
  });
  safeCase('N38-CLEANUP', () => {
    const worktrees = spawnSync('git', ['worktree', 'list', '--porcelain'], { cwd: root, encoding: 'utf8', windowsHide: true });
    assert(worktrees.status === 0 && !worktrees.stdout.includes('.n38-freeze-') && !worktrees.stdout.includes('.n37-n36-baseline-'));
    assert(!readdirSync(join(root, '..', '..')).some((entry) => entry.startsWith('n38-')));
  });
  safeCase('N38-OUTPUT-REDACTION', () => {
    const serialized = JSON.stringify(regression);
    assert(!/(?:postgres(?:ql)?:\/\/|[A-Z]:\\|[A-Z]:\/(?!\/)|node_modules|stack trace)/iu.test(serialized));
    assert(n37Source.includes("JSON.stringify({ caseId, status: 'passed', reasonCode: 'NONE' })"));
    assert(!/console\.log\((?:error|stack)|console\.error/iu.test(n37Source));
  });
  if (process.exitCode) process.exit(1);
  } catch {
    console.log(JSON.stringify({ caseId: 'N38-BOOTSTRAP', status: 'failed', reasonCode: 'N38_EVAL_FAILED' }));
  process.exitCode = 1;
}
