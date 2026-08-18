import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const baselineCommit = '3ea75be';
const n34ManifestPath = 'tests/evals/n34-freeze-manifest.json';
const n35CasesPath = 'tests/evals/n35-synthetic-knowledge-modes.json';
const rootKeys = [
  'schemaVersion', 'evidenceType', 'nodeOrder', 'expectedNodeCount', 'items', 'readiness',
  'productionBlockers', 'productionFreeze', 'syntheticOnly', 'productionIntegration', 'manifestDigest',
];
const itemKeys = ['nodeId', 'evidenceKind', 'acceptanceStatus', 'evalCount', 'rehearsalRuns', 'evidenceDigest'];
const freezeKeys = ['status', 'authorization', 'realInputs'];
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

function readText(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function assert(condition) {
  if (!condition) throw new Error('N36 assertion failed');
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function withoutDigest(manifest) {
  const { manifestDigest: _manifestDigest, ...content } = manifest;
  return content;
}

function validateManifest(manifest) {
  assert(JSON.stringify(Object.keys(manifest)) === JSON.stringify(rootKeys));
  assert(manifest.schemaVersion === 'n34.v1');
  assert(manifest.evidenceType === 'synthetic_rehearsal_final_freeze');
  assert(JSON.stringify(manifest.nodeOrder) === JSON.stringify(nodeOrder));
  assert(manifest.expectedNodeCount === 6 && manifest.items.length === 6);
  assert(JSON.stringify(Object.keys(manifest.readiness)) === JSON.stringify(['local_eval', 'rehearsal', 'production']));
  assert(JSON.stringify(manifest.readiness) === JSON.stringify({
    local_eval: 'LOCAL_EVAL_READY', rehearsal: 'REHEARSAL_READY', production: 'NOT_READY',
  }));
  assert(JSON.stringify(manifest.productionBlockers) === JSON.stringify(productionBlockers));
  assert(JSON.stringify(Object.keys(manifest.productionFreeze)) === JSON.stringify(freezeKeys));
  assert(JSON.stringify(manifest.productionFreeze) === JSON.stringify({
    status: 'FROZEN', authorization: 'NOT_GRANTED', realInputs: 'NOT_AVAILABLE',
  }));
  assert(manifest.syntheticOnly === true && manifest.productionIntegration === false);
  assert(/^[a-f0-9]{64}$/u.test(manifest.manifestDigest));
  return true;
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

function runN35Regression() {
  const result = spawnSync(process.execPath, ['--no-warnings', 'tests/evals/run-n35-eval.mjs'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 360_000,
    windowsHide: true,
    env: { ...process.env },
  });
  assert(result.status === 0);
  const events = `${result.stdout ?? ''}`.split(/\r?\n/u).flatMap((line) => {
    try {
      const value = JSON.parse(line);
      return value.status === 'passed' && typeof value.caseId === 'string' ? [value.caseId] : [];
    } catch {
      return [];
    }
  });
  assert(JSON.stringify(events) === JSON.stringify(n35CaseIds));
}

function changedFilesSinceBaseline() {
  const tracked = spawnSync('git', ['diff', '--name-only', '-z', baselineCommit], { cwd: root, encoding: 'utf8', windowsHide: true });
  const untracked = spawnSync('git', ['status', '--porcelain=v1', '-z'], { cwd: root, encoding: 'utf8', windowsHide: true });
  assert(tracked.status === 0 && untracked.status === 0);
  const trackedFiles = `${tracked.stdout ?? ''}`.split('\0').filter(Boolean);
  const untrackedFiles = `${untracked.stdout ?? ''}`.split('\0').filter(Boolean).map((entry) => entry.slice(3));
  return [...new Set([...trackedFiles, ...untrackedFiles])];
}

function safeCase(caseId, callback) {
  try {
    callback();
    console.log(JSON.stringify({ caseId, status: 'passed', reasonCode: 'NONE' }));
  } catch {
    console.log(JSON.stringify({ caseId, status: 'failed', reasonCode: 'N36_EVAL_FAILED' }));
    process.exitCode = 1;
  }
}

try {
  const evalCases = readJson('tests/evals/n36-freeze-maintenance.json');
  const manifest = readJson(n34ManifestPath);
  const n35Cases = readJson(n35CasesPath);
  const packageJson = readJson('package.json');
  const n36Source = readText('tests/evals/run-n36-eval.mjs');
  const n34Source = readText('tests/evals/run-n34-eval.mjs');
  const runbook = readText('docs/运行手册.md');

  assert(Array.isArray(evalCases) && evalCases.length === 15);
  assert(new Set(evalCases.map((testCase) => testCase.id)).size === 15);
  validateManifest(manifest);
  const expectedItems = [
    ['N29', 'pending_template', 15, 0], ['N30', 'synthetic_example', 14, 0],
    ['N31', 'consistency_regression', 14, 0], ['N32', 'boundary_regression', 12, 0],
    ['N33', 'evidence_seal', 16, 0], ['N33-R1', 'same_schema_rehearsal_isolation', 0, 3],
  ];
  const freezeCheckSummary = {
    sourceSchemaVersion: manifest.schemaVersion,
    manifestDigestMatch: sha256(JSON.stringify(withoutDigest(manifest))) === manifest.manifestDigest,
    nodeOrderValid: JSON.stringify(manifest.nodeOrder) === JSON.stringify(nodeOrder),
    expectedNodeCount: manifest.expectedNodeCount,
    productionReadiness: manifest.readiness.production,
    productionFreezeStatus: manifest.productionFreeze.status,
    productionAuthorization: manifest.productionFreeze.authorization,
    realInputs: manifest.productionFreeze.realInputs,
    syntheticOnly: manifest.syntheticOnly,
    productionIntegration: manifest.productionIntegration,
  };

  safeCase('N36-N34-EXACT-KEYS', () => {
    assert(JSON.stringify(Object.keys(manifest)) === JSON.stringify(rootKeys));
    assert(manifest.items.every((item) => JSON.stringify(Object.keys(item)) === JSON.stringify(itemKeys)));
    assert(JSON.stringify(Object.keys(manifest.productionFreeze)) === JSON.stringify(freezeKeys));
  });
  safeCase('N36-N34-NODE-ORDER', () => assert(JSON.stringify(manifest.nodeOrder) === JSON.stringify(nodeOrder)));
  safeCase('N36-N34-ITEM-COUNTS', () => {
    assert(manifest.items.every((item, index) => {
      const [nodeId, evidenceKind, evalCount, rehearsalRuns] = expectedItems[index];
      return item.nodeId === nodeId && item.evidenceKind === evidenceKind
        && item.acceptanceStatus === 'ACCEPTED' && item.evalCount === evalCount && item.rehearsalRuns === rehearsalRuns;
    }));
  });
  safeCase('N36-N34-DIGEST', () => {
    assert(freezeCheckSummary.manifestDigestMatch);
    assert(manifest.items.every((item) => /^[a-f0-9]{64}$/u.test(item.evidenceDigest)));
    assert(n34Source.includes('withoutDigest') && n34Source.includes('manifestDigest'));
  });
  safeCase('N36-FREEZE-STATUS', () => assert(freezeCheckSummary.productionFreezeStatus === 'FROZEN'));
  safeCase('N36-FREEZE-AUTHORIZATION', () => assert(freezeCheckSummary.productionAuthorization === 'NOT_GRANTED'));
  safeCase('N36-FREEZE-REAL-INPUTS', () => assert(freezeCheckSummary.realInputs === 'NOT_AVAILABLE'));
  safeCase('N36-READINESS-LOCAL-EVAL', () => {
    const result = runReadiness('local_eval');
    assert(result.exitCode === 0 && result.report.status === 'LOCAL_EVAL_READY' && result.report.reasonCodes.length === 0);
  });
  safeCase('N36-READINESS-REHEARSAL', () => {
    const result = runReadiness('rehearsal');
    assert(result.exitCode === 0 && result.report.status === 'REHEARSAL_READY' && result.report.reasonCodes.length === 0);
  });
  safeCase('N36-READINESS-PRODUCTION', () => {
    const result = runReadiness('production');
    assert(result.exitCode === 1 && result.report.status === 'NOT_READY');
  });
  safeCase('N36-PRODUCTION-BLOCKERS', () => {
    const result = runReadiness('production');
    assert(JSON.stringify(result.report.reasonCodes) === JSON.stringify(productionBlockers));
  });
  safeCase('N36-N35-TRI-MODE', () => {
    assert(JSON.stringify(n35Cases.map((testCase) => testCase.id)) === JSON.stringify(n35CaseIds));
    assert(n35Cases.filter((testCase) => testCase.category === 'local_eval').length === 4);
    assert(n35Cases.filter((testCase) => testCase.category === 'rehearsal').length === 4);
    assert(n35Cases.filter((testCase) => testCase.category === 'production').length === 3);
  });
  safeCase('N36-N35-REGRESSION', runN35Regression);
  safeCase('N36-FILE-BOUNDARY', () => {
    const allowed = new Set([
      'tests/evals/n36-freeze-maintenance.json', 'tests/evals/run-n36-eval.mjs',
      'docs/adr/0034-N36非生产主线封存与生产冻结维护.md', 'docs/N36-acceptance.md', 'docs/运行手册.md', 'package.json',
    ]);
    assert(changedFilesSinceBaseline().every((file) => allowed.has(file)));
    assert(!changedFilesSinceBaseline().includes(n34ManifestPath));
    assert(packageJson.scripts['test:langgraph-lab'].includes('run-n36-eval.mjs'));
    assert(runbook.includes('N36'));
  });
  safeCase('N36-OUTPUT-REDACTION', () => {
    const serialized = JSON.stringify(freezeCheckSummary);
    assert(!/(?:postgres(?:ql)?:\/\/|[A-Z]:\\|[A-Z]:\/(?!\/)|node_modules|stack trace)/iu.test(serialized));
    assert(n36Source.includes("JSON.stringify({ caseId, status: 'passed', reasonCode: 'NONE' })"));
    assert(!/console\.log\((?:error|stack)|console\.error/iu.test(n36Source));
  });

  if (process.exitCode) process.exit(1);
} catch {
  console.log(JSON.stringify({ caseId: 'N36-BOOTSTRAP', status: 'failed', reasonCode: 'N36_EVAL_FAILED' }));
  process.exitCode = 1;
}
