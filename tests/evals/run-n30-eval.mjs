import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');

function readText(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function assert(condition) {
  if (!condition) throw new Error('assertion failed');
}

function runReadiness(target) {
  const packageManager = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const result = spawnSync(packageManager, ['release:readiness', `--target=${target}`], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env },
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
    console.log(JSON.stringify({ caseId, status: 'failed', reasonCode: 'N30_EVAL_FAILED' }));
    process.exitCode = 1;
  }
}

try {
  const cases = readJson('tests/evals/n30-synthetic-decision.json');
  const example = readText('docs/examples/N30-synthetic-rehearsal-decision.md');
  const adr = readText('docs/adr/0028-N30-synthetic-rehearsal-example.md');
  const acceptance = readText('docs/N30-acceptance.md');
  const packageJson = readJson('package.json');
  const n29Template = readText('docs/templates/N29-生产准入待确认模板.md');
  const n29Evaluator = readText('tests/evals/run-n29-eval.mjs');
  const readinessSource = readText('scripts/release-readiness.mjs');

  assert(cases.length === 14);
  assert(new Set(cases.map((testCase) => testCase.id)).size === 14);
  assert(cases.filter((testCase) => testCase.category === 'field-contract').length === 3);
  assert(cases.filter((testCase) => testCase.category === 'synthetic-marker').length === 2);
  assert(cases.filter((testCase) => testCase.category === 'target-mode').length === 2);
  assert(cases.filter((testCase) => testCase.category === 'production-gate').length === 2);
  assert(cases.filter((testCase) => testCase.category === 'boundary').length === 3);
  assert(cases.filter((testCase) => testCase.category === 'runtime-regression').length === 2);
  assert(existsSync(join(root, 'docs', 'examples', 'N30-synthetic-rehearsal-decision.md')));

  const fields = [
    'businessInputPackage', 'businessOwnerRef', 'finalApproverRef', 'knowledgeSourceRef',
    'knowledgeVersion', 'knowledgeEffectiveAt', 'knowledgeOwnerRef', 'agentProviderRef',
    'staffIdentityRef', 'deploymentTargetRef', 'environmentTarget', 'dataRetentionPolicyRef',
    'rollbackOwnerRef', 'rollbackPlanRef', 'confirmationStatus', 'productionReadiness',
    'contentSha256', 'canonicalSha256',
  ];

  safeCase('N30-T01', () => {
    for (const field of fields) assert(example.includes(`${field}:`));
  });
  safeCase('N30-T02', () => {
    assert(example.includes('confirmationStatus: SYNTHETIC_ONLY'));
    assert(example.includes('productionReadiness: NOT_READY'));
  });
  safeCase('N30-T03', () => {
    assert(example.includes('contentSha256: SYNTHETIC_NOT_COMPUTED'));
    assert(example.includes('canonicalSha256: SYNTHETIC_NOT_COMPUTED'));
  });
  safeCase('N30-T04', () => {
    const referenceLines = example.split(/\r?\n/u).filter((line) => /:/.test(line));
    for (const line of referenceLines) {
      if (/productionReadiness|confirmationStatus/.test(line)) continue;
      assert(/SYNTHETIC[_-]/u.test(line));
    }
  });
  safeCase('N30-T05', () => {
    assert(!/(https?:\/\/|postgresql:\/\/|\bsk-[A-Za-z0-9]{12,}\b|password|token|credential|customer data)/iu.test(example));
  });
  safeCase('N30-T06', () => {
    assert(example.includes('environmentTarget: SYNTHETIC_LOCAL_REHEARSAL'));
    assert(example.includes('deploymentTargetRef: SYNTHETIC_LOCAL_REHEARSAL'));
  });
  safeCase('N30-T07', () => {
    assert(example.includes('local_eval'));
    assert(example.includes('rehearsal'));
    assert(example.includes('不能解冻 N29'));
  });
  safeCase('N30-T08', () => {
    const result = runReadiness('production');
    assert(result.exitCode === 1 && result.report.status === 'NOT_READY');
  });
  safeCase('N30-T09', () => {
    const result = runReadiness('production');
    assert(JSON.stringify(result.report.reasonCodes) === JSON.stringify([
      'BUSINESS_NOT_PRODUCTION_READY',
      'KNOWLEDGE_SOURCE_NOT_APPROVED',
      'SYNTHETIC_NOT_PRODUCTION',
      'STAFF_IDENTITY_NOT_CONFIGURED',
      'AGENT_PROVIDER_NOT_CONFIGURED',
      'DEPLOYMENT_TARGET_NOT_CONFIGURED',
    ]));
  });
  safeCase('N30-T10', () => {
    assert(n29Template.includes('confirmationStatus: PENDING_CONFIRMATION'));
    assert(n29Template.includes('productionReadiness: NOT_READY'));
    assert(!n29Template.includes('SYNTHETIC_DETERMINISTIC_LOCAL_PROVIDER'));
  });
  safeCase('N30-T11', () => {
    assert(!n29Evaluator.includes('run-n30-eval'));
    assert(!n29Evaluator.includes('N30-'));
  });
  safeCase('N30-T12', () => {
    assert(adr.includes('不得修改 `packages/config`'));
    assert(adr.includes('readiness evaluator'));
    assert(acceptance.includes('does not modify N29'));
    assert(readinessSource.includes('NOT_READY'));
  });
  safeCase('N30-T13', () => {
    const local = runReadiness('local_eval');
    const rehearsal = runReadiness('rehearsal');
    assert(local.exitCode === 0 && local.report.status === 'LOCAL_EVAL_READY' && local.report.reasonCodes.length === 0);
    assert(rehearsal.exitCode === 0 && rehearsal.report.status === 'REHEARSAL_READY' && rehearsal.report.reasonCodes.length === 0);
  });
  safeCase('N30-T14', () => {
    assert(packageJson.scripts['test:langgraph-lab'].includes('run-n30-eval.mjs'));
    assert(acceptance.includes('exactly 14 cases'));
  });

  if (process.exitCode) process.exit(1);
} catch {
  console.log(JSON.stringify({ caseId: 'N30-BOOTSTRAP', status: 'failed', reasonCode: 'N30_EVAL_FAILED' }));
  process.exitCode = 1;
}
