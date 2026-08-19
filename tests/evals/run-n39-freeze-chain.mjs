import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const packageManager = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const baselineCommit = 'e1b313f';
const manifestPath = 'tests/evals/n39-freeze-chain.json';
const rootKeys = [
  'schemaVersion', 'evidenceType', 'nodeOrder', 'expectedNodeCount', 'items', 'readiness',
  'productionBlockers', 'productionFreeze', 'syntheticOnly', 'productionIntegration', 'manifestDigest',
];
const itemKeys = ['nodeId', 'evidenceKind', 'acceptanceStatus', 'evalCount', 'repeatRuns', 'evidenceDigest'];
const nodeOrder = ['N34', 'N35', 'N36', 'N37', 'N38'];
const readiness = { local_eval: 'LOCAL_EVAL_READY', rehearsal: 'REHEARSAL_READY', production: 'NOT_READY' };
const productionBlockers = [
  'BUSINESS_NOT_PRODUCTION_READY',
  'KNOWLEDGE_SOURCE_NOT_APPROVED',
  'SYNTHETIC_NOT_PRODUCTION',
  'STAFF_IDENTITY_NOT_CONFIGURED',
  'AGENT_PROVIDER_NOT_CONFIGURED',
  'DEPLOYMENT_TARGET_NOT_CONFIGURED',
];
const productionFreeze = { status: 'FROZEN', authorization: 'NOT_GRANTED', realInputs: 'NOT_AVAILABLE' };
const n34CaseIds = [
  'N34-CHAIN-ORDER', 'N34-N29-ITEM', 'N34-N30-ITEM', 'N34-N31-ITEM', 'N34-N32-ITEM', 'N34-N33-ITEM',
  'N34-N33-R1-ITEM', 'N34-READINESS-LOCAL-EVAL', 'N34-READINESS-REHEARSAL', 'N34-READINESS-PRODUCTION',
  'N34-PRODUCTION-BLOCKERS', 'N34-FREEZE-STATUS', 'N34-FREEZE-NO-AUTHORIZATION', 'N34-R1-REHEARSAL-COUNT',
  'N34-R1-REHEARSAL-SUMMARY', 'N34-MANIFEST-EXACT-KEYS', 'N34-MANIFEST-DIGEST-TAMPER', 'N34-MANIFEST-SENSITIVE-FIELD',
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
  'N36-FREEZE-STATUS', 'N36-FREEZE-AUTHORIZATION', 'N36-FREEZE-REAL-INPUTS', 'N36-READINESS-LOCAL-EVAL',
  'N36-READINESS-REHEARSAL', 'N36-READINESS-PRODUCTION', 'N36-PRODUCTION-BLOCKERS', 'N36-N35-TRI-MODE',
  'N36-N35-REGRESSION', 'N36-FILE-BOUNDARY', 'N36-OUTPUT-REDACTION',
];
const n37CaseIds = [
  'N37-N34-EXACT-KEYS', 'N37-N34-NODE-ORDER', 'N37-N34-DIGEST', 'N37-N34-FREEZE', 'N37-N35-CASE-COUNT',
  'N37-N35-CASE-ALLOWLIST', 'N37-N35-OUTPUT-CONTRACT', 'N37-N36-CASE-COUNT', 'N37-N36-CASE-ALLOWLIST',
  'N37-N36-OUTPUT-CONTRACT', 'N37-READINESS-LOCAL-EVAL', 'N37-READINESS-REHEARSAL', 'N37-READINESS-PRODUCTION',
  'N37-FILE-BOUNDARY', 'N37-OUTPUT-REDACTION',
];
const n38CaseIds = [
  'N38-BASELINE-COMMIT', 'N38-N36-CASE-COUNT', 'N38-N36-CASE-ALLOWLIST', 'N38-FIRST-RUN', 'N38-SECOND-RUN',
  'N38-SUMMARY-DETERMINISM', 'N38-FILE-BOUNDARY', 'N38-CLEANUP', 'N38-OUTPUT-REDACTION',
];
const sourceDefinitions = [
  { nodeId: 'N34', paths: ['tests/evals/n34-freeze-manifest.json', 'tests/evals/run-n34-eval.mjs'], caseIds: n34CaseIds, evalCount: 18, repeatRuns: 0, evidenceKind: 'freeze_manifest' },
  { nodeId: 'N35', paths: ['tests/evals/n35-synthetic-knowledge-modes.json', 'tests/evals/run-n35-eval.mjs'], caseIds: n35CaseIds, evalCount: 18, repeatRuns: 0, evidenceKind: 'synthetic_state_regression' },
  { nodeId: 'N36', paths: ['tests/evals/n36-freeze-maintenance.json', 'tests/evals/run-n36-eval.mjs'], caseIds: n36CaseIds, evalCount: 15, repeatRuns: 0, evidenceKind: 'freeze_maintenance_regression' },
  { nodeId: 'N37', paths: ['tests/evals/n37-freeze-regression.json', 'tests/evals/run-n37-freeze-regression.mjs'], caseIds: n37CaseIds, evalCount: 15, repeatRuns: 1, evidenceKind: 'baseline_regression' },
  { nodeId: 'N38', paths: ['tests/evals/n38-freeze-determinism.json', 'tests/evals/run-n38-freeze-determinism.mjs'], caseIds: n38CaseIds, evalCount: 9, repeatRuns: 2, evidenceKind: 'determinism_regression' },
];
const sourceHashes = {
  'tests/evals/n34-freeze-manifest.json': '9d4ba37a620f636ae80dfc89ff27bd2e2508c1f3c5585515c768982be6a3e4eb',
  'tests/evals/run-n34-eval.mjs': '8d5f9017987a52064e7a01054c29bc27be82c30b2ed5e4ceb5330feee283e565',
  'tests/evals/n35-synthetic-knowledge-modes.json': 'aaf8de5444c0f29b933676322e70e64b24680e5ef96b77f3aa79a7309112d46a',
  'tests/evals/run-n35-eval.mjs': 'bab34af78d9aa048ae4cfac3ebcc1bb72a4ded1aa84a85f26457281af9807233',
  'tests/evals/n36-freeze-maintenance.json': '7fe8e7d0337b1818286bbc10e137f72f1827996bf0052a58584afe936eafa688',
  'tests/evals/run-n36-eval.mjs': 'ea7257a37af8f3e5e8ab5eaae5f540fce50318d1c6595f2f2c80a6f4cd193698',
  'tests/evals/n37-freeze-regression.json': '0421c82317a93331e35e9d268c0d45e833bc1e3e29ad5f282c372ce314e6dcdf',
  'tests/evals/run-n37-freeze-regression.mjs': 'd1823853fb6e85a63799e54c6c453a49a145eb1bfe69ed59c9b7681391e3798f',
  'tests/evals/n38-freeze-determinism.json': 'd52d8d393bfe0a5e1ba3b18aeb18360ee62f12b716e691e23db1812fc3896f7c',
  'tests/evals/run-n38-freeze-determinism.mjs': '621276a4f35db55fbc6c0bfb3c06be9f1af79fa925ff94db988c206bb57d1532',
};
const n39CaseIds = [
  'N39-CHAIN-ORDER', 'N39-N34-SOURCE', 'N39-N35-SOURCE', 'N39-N36-SOURCE', 'N39-N37-SOURCE', 'N39-N38-SOURCE',
  'N39-COUNT-MATRIX', 'N39-READINESS-LOCAL-EVAL', 'N39-READINESS-REHEARSAL', 'N39-READINESS-PRODUCTION',
  'N39-PRODUCTION-BLOCKERS', 'N39-PRODUCTION-FREEZE', 'N39-N38-INVOKE', 'N39-N38-DETERMINISM',
  'N39-MANIFEST-EXACT-KEYS-DIGEST', 'N39-REDACTION-CLEANUP',
];

class EvaluationFailure extends Error {
  constructor(code) { super(code); this.code = code; }
}

function readText(relativePath) { return readFileSync(join(root, relativePath), 'utf8'); }
function readJson(relativePath) { return JSON.parse(readText(relativePath)); }
function assert(condition) { if (!condition) throw new Error('N39 assertion failed'); }
function fail(code) { throw new EvaluationFailure(code); }
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function fileSha256(relativePath) { return sha256(readFileSync(join(root, relativePath))); }
function withoutDigest(value, key) { const { [key]: _digest, ...content } = value; return content; }

function actualCaseIds(definition) {
  if (definition.nodeId === 'N34') return [...readText(definition.paths[1]).matchAll(/safeCase\('([^']+)'/gu)].map((match) => match[1]);
  const cases = readJson(definition.paths[0]);
  return (Array.isArray(cases) ? cases : cases.cases).map((testCase) => testCase.id);
}

function evidenceSummary(definition) {
  return {
    nodeId: definition.nodeId,
    sourceDigests: definition.paths.map((path) => sourceHashes[path]),
    caseIds: definition.caseIds,
    evalCount: definition.evalCount,
    repeatRuns: definition.repeatRuns,
    acceptanceStatus: 'ACCEPTED',
    readiness,
    productionBlockers,
    productionFreeze,
    syntheticOnly: true,
    productionIntegration: false,
    baselineCommit: '2b8a473',
  };
}

function parseSafeEvents(output) {
  return `${output ?? ''}`.split(/\r?\n/u).flatMap((line) => {
    try {
      const event = JSON.parse(line);
      return event && typeof event.caseId === 'string' && event.status === 'passed' && event.reasonCode === 'NONE'
        ? [{ caseId: event.caseId, status: event.status, reasonCode: event.reasonCode }] : [];
    } catch { return []; }
  });
}

function runN38InClone() {
  const clonePath = mkdtempSync(join(root, '..', '..', 'n39-'));
  rmSync(clonePath, { recursive: true, force: true });
  let cloneCreated = false;
  try {
    const cloned = spawnSync('git', ['clone', '--no-local', '--no-checkout', root, clonePath], { cwd: root, encoding: 'utf8', windowsHide: true });
    if (cloned.status !== 0 || cloned.error) fail('N39_SOURCE_MISSING');
    cloneCreated = true;
    const checkout = spawnSync('git', ['checkout', '--detach', baselineCommit], { cwd: clonePath, encoding: 'utf8', windowsHide: true });
    if (checkout.status !== 0 || checkout.error) fail('N39_SOURCE_MISMATCH');
    symlinkSync(join(root, 'apps/api/dist'), join(clonePath, 'apps/api/dist'), 'junction');
    const result = spawnSync(process.execPath, ['--no-warnings', 'tests/evals/run-n38-freeze-determinism.mjs'], {
      cwd: clonePath, encoding: 'utf8', timeout: 900_000, windowsHide: true, env: { ...process.env },
    });
    if (result.status !== 0 || result.error) {
      fail('N39_N38_FAILED');
    }
    const events = parseSafeEvents(result.stdout);
    assert(events.length === 9 && JSON.stringify(events.map((event) => event.caseId)) === JSON.stringify(n38CaseIds));
    return events;
  } finally {
    try { if (cloneCreated) rmSync(clonePath, { recursive: true, force: true }); } catch { fail('N39_CLEANUP_FAILED'); }
    if (existsSync(clonePath)) fail('N39_CLEANUP_FAILED');
  }
}

function safeCase(caseId, callback, failureReasonCode = 'N39_EVAL_FAILED') {
  try {
    callback();
    console.log(JSON.stringify({ caseId, status: 'passed', reasonCode: 'NONE' }));
  } catch (error) {
    const reasonCode = error instanceof EvaluationFailure ? error.code : failureReasonCode;
    console.log(JSON.stringify({ caseId, status: 'failed', reasonCode }));
    process.exitCode = 1;
  }
}

try {
  const manifest = readJson(manifestPath);
  const packageJson = readJson('package.json');
  const runbook = readText('docs/运行手册.md');
  let n38Events;
  safeCase('N39-CHAIN-ORDER', () => {
    assert(JSON.stringify(Object.keys(manifest)) === JSON.stringify(rootKeys));
    assert(manifest.schemaVersion === 'n39.v1' && manifest.evidenceType === 'freeze_chain_final_seal');
    assert(JSON.stringify(manifest.nodeOrder) === JSON.stringify(nodeOrder) && manifest.expectedNodeCount === 5);
  }, 'N39_MANIFEST_INVALID');
  for (const definition of sourceDefinitions) {
    safeCase(`N39-${definition.nodeId}-SOURCE`, () => {
      assert(definition.paths.every((path) => existsSync(join(root, path)) && fileSha256(path) === sourceHashes[path]));
      assert(JSON.stringify(actualCaseIds(definition)) === JSON.stringify(definition.caseIds));
    }, 'N39_SOURCE_MISMATCH');
  }
  safeCase('N39-COUNT-MATRIX', () => {
    assert(manifest.items.length === 5);
    assert(manifest.items.every((item, index) => JSON.stringify(Object.keys(item)) === JSON.stringify(itemKeys)
      && item.nodeId === sourceDefinitions[index].nodeId
      && item.evidenceKind === sourceDefinitions[index].evidenceKind
      && item.acceptanceStatus === 'ACCEPTED'
      && item.evalCount === sourceDefinitions[index].evalCount
      && item.repeatRuns === sourceDefinitions[index].repeatRuns));
  }, 'N39_COUNT_MISMATCH');
  safeCase('N39-READINESS-LOCAL-EVAL', () => assert(manifest.readiness.local_eval === 'LOCAL_EVAL_READY'), 'N39_READINESS_MISMATCH');
  safeCase('N39-READINESS-REHEARSAL', () => assert(manifest.readiness.rehearsal === 'REHEARSAL_READY'), 'N39_READINESS_MISMATCH');
  safeCase('N39-READINESS-PRODUCTION', () => assert(manifest.readiness.production === 'NOT_READY'), 'N39_READINESS_MISMATCH');
  safeCase('N39-PRODUCTION-BLOCKERS', () => assert(JSON.stringify(manifest.productionBlockers) === JSON.stringify(productionBlockers)), 'N39_BLOCKER_ORDER_MISMATCH');
  safeCase('N39-PRODUCTION-FREEZE', () => {
    assert(JSON.stringify(manifest.productionFreeze) === JSON.stringify(productionFreeze));
    assert(manifest.syntheticOnly === true && manifest.productionIntegration === false);
  }, 'N39_MANIFEST_INVALID');
  safeCase('N39-N38-INVOKE', () => { n38Events = runN38InClone(); }, 'N39_N38_FAILED');
  safeCase('N39-N38-DETERMINISM', () => {
    assert(Array.isArray(n38Events) && n38Events.length === 9);
    assert(n38Events.every((event) => n38CaseIds.includes(event.caseId)));
    assert(n38Events.some((event) => event.caseId === 'N38-SUMMARY-DETERMINISM'));
  }, 'N39_N38_DETERMINISM_MISMATCH');
  safeCase('N39-MANIFEST-EXACT-KEYS-DIGEST', () => {
    assert(manifest.items.every((item, index) => item.evidenceDigest === sha256(JSON.stringify(evidenceSummary(sourceDefinitions[index])))));
    assert(manifest.manifestDigest === sha256(JSON.stringify(withoutDigest(manifest, 'manifestDigest'))));
    assert(Buffer.byteLength(JSON.stringify(manifest), 'utf8') <= 12 * 1024);
  }, 'N39_MANIFEST_INVALID');
  safeCase('N39-REDACTION-CLEANUP', () => {
    const serialized = JSON.stringify(manifest);
    assert(!/(?:https?:\/\/|postgres(?:ql)?:\/\/|\b(?:token|password|secret)\b|[A-Z]:[\\/]|\/(?:Users|home)\/|customer message|raw log|stack trace|node_modules)/iu.test(serialized));
    assert(packageJson.scripts['test:langgraph-lab'].includes('run-n39-freeze-chain.mjs'));
    assert(!packageJson.scripts['test:langgraph-lab'].includes('run-n38-freeze-determinism.mjs'));
    assert(runbook.includes('N39'));
    const worktrees = spawnSync('git', ['worktree', 'list', '--porcelain'], { cwd: root, encoding: 'utf8', windowsHide: true });
    assert(worktrees.status === 0 && !worktrees.stdout.includes('n39-') && !worktrees.stdout.includes('n38-'));
    assert(!existsSync(join(root, '..', '..', 'n39-')));
  }, 'N39_SENSITIVE_OUTPUT');
  if (process.exitCode) process.exit(1);
} catch {
  console.log(JSON.stringify({ caseId: 'N39-BOOTSTRAP', status: 'failed', reasonCode: 'N39_EVAL_FAILED' }));
  process.exitCode = 1;
}
