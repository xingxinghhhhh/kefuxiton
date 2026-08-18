import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const manifestRelativePath = 'tests/evals/n34-freeze-manifest.json';
const ROOT_KEYS = [
  'schemaVersion', 'evidenceType', 'nodeOrder', 'expectedNodeCount', 'items', 'readiness',
  'productionBlockers', 'productionFreeze', 'syntheticOnly', 'productionIntegration', 'manifestDigest',
];
const ITEM_KEYS = ['nodeId', 'evidenceKind', 'acceptanceStatus', 'evalCount', 'rehearsalRuns', 'evidenceDigest'];
const READINESS_KEYS = ['local_eval', 'rehearsal', 'production'];
const FREEZE_KEYS = ['status', 'authorization', 'realInputs'];
const NODE_ORDER = ['N29', 'N30', 'N31', 'N32', 'N33', 'N33-R1'];
const PRODUCTION_BLOCKERS = [
  'BUSINESS_NOT_PRODUCTION_READY',
  'KNOWLEDGE_SOURCE_NOT_APPROVED',
  'SYNTHETIC_NOT_PRODUCTION',
  'STAFF_IDENTITY_NOT_CONFIGURED',
  'AGENT_PROVIDER_NOT_CONFIGURED',
  'DEPLOYMENT_TARGET_NOT_CONFIGURED',
];

function readText(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function assert(condition) {
  if (!condition) throw new Error('assertion failed');
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function withoutDigest(manifest) {
  const { manifestDigest: _manifestDigest, ...content } = manifest;
  return content;
}

function expectedEvidenceSummaries() {
  return [
    {
      nodeId: 'N29', evidenceKind: 'pending_template', acceptanceStatus: 'ACCEPTED', evalCount: 15,
      rehearsalRuns: 0, securityScope: 'synthetic_only', productionReadiness: 'NOT_READY', productionIntegration: false,
    },
    {
      nodeId: 'N30', evidenceKind: 'synthetic_example', acceptanceStatus: 'ACCEPTED', evalCount: 14,
      rehearsalRuns: 0, securityScope: 'synthetic_only', productionReadiness: 'NOT_READY', productionIntegration: false,
    },
    {
      nodeId: 'N31', evidenceKind: 'consistency_regression', acceptanceStatus: 'ACCEPTED', evalCount: 14,
      rehearsalRuns: 0, securityScope: 'synthetic_only', productionReadiness: 'NOT_READY', productionIntegration: false,
    },
    {
      nodeId: 'N32', evidenceKind: 'boundary_regression', acceptanceStatus: 'ACCEPTED', evalCount: 12,
      rehearsalRuns: 0, securityScope: 'synthetic_only', productionReadiness: 'NOT_READY', productionIntegration: false,
    },
    {
      nodeId: 'N33', evidenceKind: 'evidence_seal', acceptanceStatus: 'ACCEPTED', evalCount: 16,
      rehearsalRuns: 0, securityScope: 'synthetic_only', productionReadiness: 'NOT_READY', productionIntegration: false,
    },
    {
      nodeId: 'N33-R1', evidenceKind: 'same_schema_rehearsal_isolation', acceptanceStatus: 'ACCEPTED', evalCount: 0,
      rehearsalRuns: 3, securityScope: 'rehearsal_only', productionReadiness: 'NOT_READY', productionIntegration: false,
      apiSmokeCleanup: 'passed', sameSchemaE2E: 'passed', e2eCaseCount: 3, rollbackValidation: 'passed',
      schemaCleanup: 'passed', worktreeCleanup: 'passed',
    },
  ];
}

function validateManifest(manifest) {
  assert(manifest && typeof manifest === 'object');
  assert(JSON.stringify(Object.keys(manifest)) === JSON.stringify(ROOT_KEYS));
  assert(manifest.schemaVersion === 'n34.v1');
  assert(manifest.evidenceType === 'synthetic_rehearsal_final_freeze');
  assert(JSON.stringify(manifest.nodeOrder) === JSON.stringify(NODE_ORDER));
  assert(manifest.expectedNodeCount === 6);
  assert(Array.isArray(manifest.items) && manifest.items.length === 6);

  const expectedSummaries = expectedEvidenceSummaries();
  const expectedPublicValues = [
    ['N29', 'pending_template', 15, 0],
    ['N30', 'synthetic_example', 14, 0],
    ['N31', 'consistency_regression', 14, 0],
    ['N32', 'boundary_regression', 12, 0],
    ['N33', 'evidence_seal', 16, 0],
    ['N33-R1', 'same_schema_rehearsal_isolation', 0, 3],
  ];
  for (const [index, [nodeId, evidenceKind, evalCount, rehearsalRuns]] of expectedPublicValues.entries()) {
    const item = manifest.items[index];
    const summary = expectedSummaries[index];
    assert(JSON.stringify(Object.keys(item)) === JSON.stringify(ITEM_KEYS));
    assert(item.nodeId === nodeId && item.evidenceKind === evidenceKind);
    assert(item.acceptanceStatus === 'ACCEPTED' && item.evalCount === evalCount && item.rehearsalRuns === rehearsalRuns);
    assert(/^[a-f0-9]{64}$/u.test(item.evidenceDigest));
    assert(item.evidenceDigest === sha256(JSON.stringify(summary)));
  }

  assert(JSON.stringify(Object.keys(manifest.readiness)) === JSON.stringify(READINESS_KEYS));
  assert(JSON.stringify(manifest.readiness) === JSON.stringify({
    local_eval: 'LOCAL_EVAL_READY', rehearsal: 'REHEARSAL_READY', production: 'NOT_READY',
  }));
  assert(JSON.stringify(manifest.productionBlockers) === JSON.stringify(PRODUCTION_BLOCKERS));
  assert(JSON.stringify(Object.keys(manifest.productionFreeze)) === JSON.stringify(FREEZE_KEYS));
  assert(JSON.stringify(manifest.productionFreeze) === JSON.stringify({
    status: 'FROZEN', authorization: 'NOT_GRANTED', realInputs: 'NOT_AVAILABLE',
  }));
  assert(manifest.syntheticOnly === true && manifest.productionIntegration === false);
  assert(/^[a-f0-9]{64}$/u.test(manifest.manifestDigest));
  assert(sha256(JSON.stringify(withoutDigest(manifest))) === manifest.manifestDigest);
  assert(Buffer.byteLength(JSON.stringify(manifest), 'utf8') <= 12 * 1024);
  return true;
}

function runReadiness(target) {
  const packageManager = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const result = spawnSync(packageManager, ['release:readiness', `--target=${target}`], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      APP_ENV: target,
      WEB_ORIGIN: target === 'production' ? 'https://support.example.test' : 'http://localhost:3000',
      DATABASE_URL: 'postgresql://readiness-check@localhost:5432/readiness-check',
      NEXT_PUBLIC_API_BASE_URL: target === 'production' ? 'https://api.example.test/api/v1' : 'http://localhost:3001/api/v1',
      STAFF_AUTH_MODE: 'deny',
      ALLOW_KNOWLEDGE_PUBLISH: '0',
    },
    shell: true,
    windowsHide: true,
  });
  const output = `${result.stdout ?? ''}`.trim().split(/\r?\n/u).filter((line) => line.startsWith('{')).at(-1) ?? '';
  return { exitCode: result.status, report: JSON.parse(output) };
}

function safeCase(caseId, callback, failureReasonCode = 'N34_EVAL_FAILED') {
  try {
    callback();
    console.log(JSON.stringify({ caseId, status: 'passed', reasonCode: 'NONE' }));
  } catch {
    console.log(JSON.stringify({ caseId, status: 'failed', reasonCode: failureReasonCode }));
    process.exitCode = 1;
  }
}

try {
  const manifest = readJson(manifestRelativePath);
  const packageJson = readJson('package.json');
  const n33Acceptance = readText('docs/N33-acceptance.md');
  const n33Adr = readText('docs/adr/0031-N33合成rehearsal安全证据最终封存.md');
  const runbook = readText('docs/运行手册.md');
  const evaluatorSource = readText('tests/evals/run-n34-eval.mjs');

  validateManifest(manifest);
  assert(packageJson.scripts['test:langgraph-lab'].includes('run-n34-eval.mjs'));

  safeCase('N34-CHAIN-ORDER', () => {
    assert(JSON.stringify(manifest.nodeOrder) === JSON.stringify(NODE_ORDER));
    assert(manifest.expectedNodeCount === manifest.items.length);
  });
  safeCase('N34-N29-ITEM', () => assert(manifest.items[0].nodeId === 'N29' && manifest.items[0].evalCount === 15 && manifest.items[0].acceptanceStatus === 'ACCEPTED'));
  safeCase('N34-N30-ITEM', () => assert(manifest.items[1].nodeId === 'N30' && manifest.items[1].evalCount === 14 && manifest.items[1].acceptanceStatus === 'ACCEPTED'));
  safeCase('N34-N31-ITEM', () => assert(manifest.items[2].nodeId === 'N31' && manifest.items[2].evalCount === 14 && manifest.items[2].acceptanceStatus === 'ACCEPTED'));
  safeCase('N34-N32-ITEM', () => assert(manifest.items[3].nodeId === 'N32' && manifest.items[3].evalCount === 12 && manifest.items[3].acceptanceStatus === 'ACCEPTED'));
  safeCase('N34-N33-ITEM', () => assert(manifest.items[4].nodeId === 'N33' && manifest.items[4].evalCount === 16 && manifest.items[4].acceptanceStatus === 'ACCEPTED'));
  safeCase('N34-N33-R1-ITEM', () => assert(manifest.items[5].nodeId === 'N33-R1' && manifest.items[5].rehearsalRuns === 3 && manifest.items[5].acceptanceStatus === 'ACCEPTED'));
  safeCase('N34-READINESS-LOCAL-EVAL', () => {
    const result = runReadiness('local_eval');
    assert(result.exitCode === 0 && result.report.status === 'LOCAL_EVAL_READY' && result.report.reasonCodes.length === 0);
  });
  safeCase('N34-READINESS-REHEARSAL', () => {
    const result = runReadiness('rehearsal');
    assert(result.exitCode === 0 && result.report.status === 'REHEARSAL_READY' && result.report.reasonCodes.length === 0);
  });
  safeCase('N34-READINESS-PRODUCTION', () => {
    const result = runReadiness('production');
    assert(result.exitCode === 1 && result.report.status === 'NOT_READY');
  });
  safeCase('N34-PRODUCTION-BLOCKERS', () => {
    const result = runReadiness('production');
    assert(JSON.stringify(result.report.reasonCodes) === JSON.stringify(PRODUCTION_BLOCKERS));
  });
  safeCase('N34-FREEZE-STATUS', () => assert(manifest.productionFreeze.status === 'FROZEN' && manifest.productionFreeze.realInputs === 'NOT_AVAILABLE'));
  safeCase('N34-FREEZE-NO-AUTHORIZATION', () => assert(manifest.productionFreeze.authorization === 'NOT_GRANTED' && manifest.productionIntegration === false && manifest.productionReadiness === undefined));
  safeCase('N34-R1-REHEARSAL-COUNT', () => {
    assert(manifest.items[5].rehearsalRuns === 3);
    assert(n33Acceptance.includes('three consecutive times') && n33Acceptance.includes('3/3'));
    assert(n33Adr.includes('Accepted only after the release rehearsal gate passes'));
  });
  safeCase('N34-R1-REHEARSAL-SUMMARY', () => {
    const summary = expectedEvidenceSummaries()[5];
    assert(summary.apiSmokeCleanup === 'passed' && summary.sameSchemaE2E === 'passed' && summary.e2eCaseCount === 3);
    assert(summary.rollbackValidation === 'passed' && summary.schemaCleanup === 'passed' && summary.worktreeCleanup === 'passed');
    assert(runbook.includes('api_smoke_cleanup') && runbook.includes('同 Schema E2E 3/3'));
  });
  safeCase('N34-MANIFEST-EXACT-KEYS', () => {
    assert(JSON.stringify(Object.keys(manifest)) === JSON.stringify(ROOT_KEYS));
    assert(manifest.items.every((item) => JSON.stringify(Object.keys(item)) === JSON.stringify(ITEM_KEYS)));
    assert(JSON.stringify(Object.keys(manifest.productionFreeze)) === JSON.stringify(FREEZE_KEYS));
    assert(sha256(JSON.stringify(withoutDigest(manifest))) === manifest.manifestDigest);
    assert(manifest.items.every((item, index) => item.evidenceDigest === sha256(JSON.stringify(expectedEvidenceSummaries()[index]))));
  }, 'N34_MANIFEST_INVALID');
  safeCase('N34-MANIFEST-DIGEST-TAMPER', () => {
    const tampered = { ...manifest, manifestDigest: '0'.repeat(64) };
    let rejected = false;
    try { validateManifest(tampered); } catch { rejected = true; }
    assert(rejected);
  }, 'N34_MANIFEST_DIGEST_MISMATCH');
  safeCase('N34-MANIFEST-SENSITIVE-FIELD', () => {
    const serialized = JSON.stringify(manifest);
    assert(!/(https?:\/\/|postgres(?:ql)?:\/\/|\b(?:token|password|secret)\b|[A-Z]:[\\/]|\/(?:Users|home)\/|customer message|raw log|stack trace)/iu.test(serialized));
    assert(evaluatorSource.includes("JSON.stringify({ caseId, status: 'passed', reasonCode: 'NONE' })"));
    assert(!/console\.log\(error|console\.log\(stack/iu.test(evaluatorSource));
  }, 'N34_SENSITIVE_DATA_REJECTED');

  if (process.exitCode) process.exit(1);
} catch {
  console.log(JSON.stringify({ caseId: 'N34-BOOTSTRAP', status: 'failed', reasonCode: 'N34_EVAL_FAILED' }));
  process.exitCode = 1;
}
