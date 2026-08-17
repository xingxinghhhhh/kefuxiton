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
    console.log(JSON.stringify({ caseId, status: 'failed', reasonCode: 'N31_EVAL_FAILED' }));
    process.exitCode = 1;
  }
}

try {
  const cases = readJson('tests/evals/n31-synthetic-readiness-consistency.json');
  const n30 = readText('docs/examples/N30-synthetic-rehearsal-decision.md');
  const n29 = readText('docs/templates/N29-生产准入待确认模板.md');
  const n31Acceptance = readText('docs/N31-acceptance.md');
  const n31Adr = readText('docs/adr/0029-N31合成准入示例与生产门禁一致性.md');
  const runbook = readText('docs/运行手册.md');
  const packageJson = readJson('package.json');
  const n29Eval = readText('tests/evals/run-n29-eval.mjs');
  const n30Eval = readText('tests/evals/run-n30-eval.mjs');
  const readinessSource = readText('scripts/release-readiness.mjs');

  assert(cases.length === 14);
  assert(new Set(cases.map((testCase) => testCase.id)).size === 14);
  assert(cases.filter((testCase) => testCase.category === 'n30-contract').length === 6);
  assert(cases.filter((testCase) => testCase.category === 'n29-contract').length === 3);
  assert(cases.filter((testCase) => testCase.category === 'readiness-mode').length === 3);
  assert(cases.filter((testCase) => testCase.category === 'blocker-order').length === 1);
  assert(cases.filter((testCase) => testCase.category === 'boundary-sanitization').length === 1);
  assert(existsSync(join(root, 'docs', 'examples', 'N30-synthetic-rehearsal-decision.md')));

  safeCase('N31-T01', () => {
    for (const field of [
      'businessInputPackage', 'businessOwnerRef', 'finalApproverRef', 'knowledgeSourceRef',
      'knowledgeVersion', 'knowledgeEffectiveAt', 'knowledgeOwnerRef', 'agentProviderRef',
      'staffIdentityRef', 'deploymentTargetRef', 'environmentTarget', 'dataRetentionPolicyRef',
      'rollbackOwnerRef', 'rollbackPlanRef', 'confirmationStatus', 'productionReadiness',
      'contentSha256', 'canonicalSha256',
    ]) assert(n30.includes(`${field}:`));
  });
  safeCase('N31-T02', () => {
    assert(n30.includes('confirmationStatus: SYNTHETIC_ONLY'));
    assert(n30.includes('productionReadiness: NOT_READY'));
  });
  safeCase('N31-T03', () => {
    for (const value of [
      'SYNTHETIC_DETERMINISTIC_LOCAL_PROVIDER', 'SYNTHETIC_DENY_BY_DEFAULT_IDENTITY',
      'SYNTHETIC_LOCAL_REHEARSAL', 'SYNTHETIC_EPHEMERAL_TEST_ONLY',
      'SYNTHETIC_RELEASE_OWNER', 'SYNTHETIC_ROLLBACK_TO_LAST_ACCEPTED_COMMIT_AND_RERUN_SMOKE',
    ]) assert(n30.includes(value));
  });
  safeCase('N31-T04', () => {
    assert(n30.includes('SYNTHETIC-IT-SERVICE-DESK-001'));
    assert(n30.includes('SYNTHETIC_REPOSITORY_FIXTURE'));
  });
  safeCase('N31-T05', () => {
    assert(n30.includes('contentSha256: SYNTHETIC_NOT_COMPUTED'));
    assert(n30.includes('canonicalSha256: SYNTHETIC_NOT_COMPUTED'));
  });
  safeCase('N31-T06', () => {
    assert(!/(https?:\/\/|postgresql:\/\/|\bsk-[A-Za-z0-9]{12,}\b|password|token|credential|customer data)/iu.test(n30));
  });
  safeCase('N31-T07', () => {
    for (const field of [
      'businessInputPackage', 'businessOwnerRef', 'finalApproverRef', 'knowledgeSourceRef',
      'knowledgeVersion', 'knowledgeEffectiveAt', 'agentProviderRef', 'staffIdentityRef',
      'deploymentTargetRef', 'dataRetentionPolicyRef', 'rollbackOwnerRef', 'rollbackPlanRef',
    ]) assert(n29.includes(`${field}: <PENDING>`));
  });
  safeCase('N31-T08', () => {
    assert(n29.includes('confirmationStatus: PENDING_CONFIRMATION'));
    assert(n29.includes('productionReadiness: NOT_READY'));
  });
  safeCase('N31-T09', () => {
    assert(n29.includes('contentSha256: <PENDING>'));
    assert(n29.includes('canonicalSha256: <PENDING>'));
  });
  safeCase('N31-T10', () => {
    const result = runReadiness('local_eval');
    assert(result.exitCode === 0 && result.report.status === 'LOCAL_EVAL_READY' && result.report.reasonCodes.length === 0);
  });
  safeCase('N31-T11', () => {
    const result = runReadiness('rehearsal');
    assert(result.exitCode === 0 && result.report.status === 'REHEARSAL_READY' && result.report.reasonCodes.length === 0);
  });
  safeCase('N31-T12', () => {
    const result = runReadiness('production');
    assert(result.exitCode === 1 && result.report.status === 'NOT_READY');
  });
  safeCase('N31-T13', () => {
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
  safeCase('N31-T14', () => {
    assert(packageJson.scripts['test:langgraph-lab'].includes('run-n31-eval.mjs'));
    assert(n31Acceptance.includes('exactly 14 cases'));
    assert(n31Adr.includes('不得修改 N29/N30 模板'));
    assert(runbook.includes('N31'));
    assert(readinessSource.includes('NOT_READY'));
    assert(!n29Eval.includes('N31-') && !n30Eval.includes('N31-'));
    assert(!n29.includes('N31') && !n30.includes('N31'));
  });

  if (process.exitCode) process.exit(1);
} catch {
  console.log(JSON.stringify({ caseId: 'N31-BOOTSTRAP', status: 'failed', reasonCode: 'N31_EVAL_FAILED' }));
  process.exitCode = 1;
}
