import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const manifestPath = join(root, 'tests', 'evals', 'n33-evidence-manifest.json');

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

function validateManifest(manifest) {
  const rootKeys = [
    'schemaVersion', 'evidenceType', 'nodeOrder', 'expectedNodeCount', 'items', 'readiness',
    'productionBlockers', 'syntheticOnly', 'productionIntegration', 'manifestDigest',
  ];
  assert(manifest && typeof manifest === 'object');
  assert(JSON.stringify(Object.keys(manifest)) === JSON.stringify(rootKeys));
  assert(manifest.schemaVersion === 'n33.v1');
  assert(manifest.evidenceType === 'synthetic_rehearsal_evidence_seal');
  assert(JSON.stringify(manifest.nodeOrder) === JSON.stringify(['N29', 'N30', 'N31', 'N32']));
  assert(manifest.expectedNodeCount === 4);
  assert(Array.isArray(manifest.items) && manifest.items.length === 4);
  const expectedItems = [
    ['N29', 15], ['N30', 14], ['N31', 14], ['N32', 12],
  ];
  for (const [index, [nodeId, evaluationCount]] of expectedItems.entries()) {
    const item = manifest.items[index];
    assert(JSON.stringify(Object.keys(item)) === JSON.stringify(['nodeId', 'acceptanceStatus', 'evaluationCount', 'securityStatus']));
    assert(item.nodeId === nodeId && item.acceptanceStatus === 'accepted');
    assert(item.evaluationCount === evaluationCount && item.securityStatus === 'synthetic_only');
  }
  assert(JSON.stringify(Object.keys(manifest.readiness)) === JSON.stringify(['local_eval', 'rehearsal', 'production']));
  assert(JSON.stringify(manifest.readiness) === JSON.stringify({ local_eval: 'LOCAL_EVAL_READY', rehearsal: 'REHEARSAL_READY', production: 'NOT_READY' }));
  assert(JSON.stringify(manifest.productionBlockers) === JSON.stringify([
    'BUSINESS_NOT_PRODUCTION_READY',
    'KNOWLEDGE_SOURCE_NOT_APPROVED',
    'SYNTHETIC_NOT_PRODUCTION',
    'STAFF_IDENTITY_NOT_CONFIGURED',
    'AGENT_PROVIDER_NOT_CONFIGURED',
    'DEPLOYMENT_TARGET_NOT_CONFIGURED',
  ]));
  assert(manifest.syntheticOnly === true && manifest.productionIntegration === false);
  assert(/^[a-f0-9]{64}$/u.test(manifest.manifestDigest));
  assert(sha256(JSON.stringify(withoutDigest(manifest))) === manifest.manifestDigest);
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

function safeCase(caseId, callback) {
  try {
    callback();
    console.log(JSON.stringify({ caseId, status: 'passed', reasonCode: 'NONE' }));
  } catch {
    console.log(JSON.stringify({ caseId, status: 'failed', reasonCode: 'N33_EVAL_FAILED' }));
    process.exitCode = 1;
  }
}

try {
  const manifest = readJson('tests/evals/n33-evidence-manifest.json');
  const cases = readJson('tests/evals/n33-evidence-manifest.json');
  const packageJson = readJson('package.json');
  const n29Eval = readText('tests/evals/run-n29-eval.mjs');
  const n30Eval = readText('tests/evals/run-n30-eval.mjs');
  const n31Eval = readText('tests/evals/run-n31-eval.mjs');
  const n32Eval = readText('tests/evals/run-n32-eval.mjs');
  const runbook = readText('docs/运行手册.md');

  assert(validateManifest(manifest));
  assert(Array.isArray(cases.items));
  assert(packageJson.scripts['test:langgraph-lab'].includes('run-n29-eval.mjs'));
  assert(packageJson.scripts['test:langgraph-lab'].includes('run-n30-eval.mjs'));
  assert(packageJson.scripts['test:langgraph-lab'].includes('run-n31-eval.mjs'));
  assert(packageJson.scripts['test:langgraph-lab'].includes('run-n32-eval.mjs'));

  safeCase('N33-T01', () => assert(JSON.stringify(manifest.nodeOrder) === JSON.stringify(['N29', 'N30', 'N31', 'N32'])));
  safeCase('N33-T02', () => assert(manifest.items[0].acceptanceStatus === 'accepted' && manifest.items.every((item) => item.securityStatus === 'synthetic_only')));
  safeCase('N33-T03', () => assert(JSON.stringify(manifest.items.map((item) => item.evaluationCount)) === JSON.stringify([15, 14, 14, 12])));
  safeCase('N33-T04', () => assert(manifest.expectedNodeCount === 4 && manifest.items.length === manifest.expectedNodeCount));
  safeCase('N33-T05', () => {
    const result = runReadiness('local_eval');
    assert(result.exitCode === 0 && result.report.status === 'LOCAL_EVAL_READY' && result.report.reasonCodes.length === 0);
  });
  safeCase('N33-T06', () => {
    const result = runReadiness('rehearsal');
    assert(result.exitCode === 0 && result.report.status === 'REHEARSAL_READY' && result.report.reasonCodes.length === 0);
  });
  safeCase('N33-T07', () => {
    const result = runReadiness('production');
    assert(result.exitCode === 1 && result.report.status === 'NOT_READY');
  });
  safeCase('N33-T08', () => {
    const result = runReadiness('production');
    assert(JSON.stringify(result.report.reasonCodes) === JSON.stringify(manifest.productionBlockers));
  });
  safeCase('N33-T09', () => assert(manifest.syntheticOnly === true));
  safeCase('N33-T10', () => assert(manifest.productionIntegration === false));
  safeCase('N33-T11', () => {
    const serialized = JSON.stringify(manifest);
    assert(!/(https?:\/\/|postgres(?:ql)?:\/\/|sk-[A-Za-z0-9]{12,}|password|token|customer data|D:\\)/iu.test(serialized));
  });
  safeCase('N33-T12', () => {
    const exactKeys = ['schemaVersion', 'evidenceType', 'nodeOrder', 'expectedNodeCount', 'items', 'readiness', 'productionBlockers', 'syntheticOnly', 'productionIntegration', 'manifestDigest'];
    assert(JSON.stringify(Object.keys(manifest)) === JSON.stringify(exactKeys));
    assert(JSON.stringify(Object.keys(manifest.items[0])) === JSON.stringify(['nodeId', 'acceptanceStatus', 'evaluationCount', 'securityStatus']));
  });
  safeCase('N33-T13', () => assert(sha256(JSON.stringify(withoutDigest(manifest))) === manifest.manifestDigest));
  safeCase('N33-T14', () => {
    const tampered = { ...manifest, manifestDigest: '0'.repeat(64) };
    let rejected = false;
    try { validateManifest(tampered); } catch { rejected = true; }
    assert(rejected);
  });
  safeCase('N33-T15', () => {
    const { readiness: _readiness, ...missing } = manifest;
    let missingRejected = false;
    try { validateManifest(missing); } catch { missingRejected = true; }
    const unknown = { ...manifest, unexpectedField: true };
    let unknownRejected = false;
    try { validateManifest(unknown); } catch { unknownRejected = true; }
    assert(missingRejected && unknownRejected);
  });
  safeCase('N33-T16', () => {
    assert(n29Eval.includes('run-n29-eval') || packageJson.scripts['test:langgraph-lab'].includes('run-n29-eval.mjs'));
    assert(n30Eval.includes('run-n30-eval') || packageJson.scripts['test:langgraph-lab'].includes('run-n30-eval.mjs'));
    assert(n31Eval.includes('run-n31-eval') || packageJson.scripts['test:langgraph-lab'].includes('run-n31-eval.mjs'));
    assert(n32Eval.includes('run-n32-eval') || packageJson.scripts['test:langgraph-lab'].includes('run-n32-eval.mjs'));
    assert(runbook.includes('N29') && runbook.includes('N30') && runbook.includes('N31') && runbook.includes('N32'));
  });

  if (process.exitCode) process.exit(1);
} catch {
  console.log(JSON.stringify({ caseId: 'N33-BOOTSTRAP', status: 'failed', reasonCode: 'N33_EVAL_FAILED' }));
  process.exitCode = 1;
}
