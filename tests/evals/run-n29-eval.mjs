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
    console.log(JSON.stringify({ caseId, status: 'failed', reasonCode: 'N29_EVAL_FAILED' }));
    process.exitCode = 1;
  }
}

try {
  const cases = readJson('tests/evals/n29-production-readiness-template.json');
  const template = readText('docs/templates/N29-生产准入待确认模板.md');
  const adr = readText('docs/adr/0027-N29生产准入待确认模板.md');
  const acceptance = readText('docs/N29-acceptance.md');
  const runbook = readText('docs/运行手册.md');
  const packageJson = readJson('package.json');
  const publishSource = readText('apps/api/scripts/knowledge/import-markdown.mjs');

  assert(cases.length === 15);
  assert(new Set(cases.map((testCase) => testCase.id)).size === 15);
  assert(cases.filter((testCase) => testCase.category === 'template').length === 5);
  assert(cases.filter((testCase) => testCase.category === 'pending-decision').length === 7);
  assert(cases.filter((testCase) => testCase.category === 'production-gate').length === 1);
  assert(cases.filter((testCase) => testCase.category === 'runtime-regression').length === 2);
  assert(existsSync(join(root, 'docs', 'templates', 'N29-生产准入待确认模板.md')));

  const fields = [
    'businessInputPackage', 'businessOwnerRef', 'finalApproverRef', 'knowledgeSourceRef',
    'knowledgeVersion', 'knowledgeEffectiveAt', 'agentProviderRef', 'staffIdentityRef',
    'deploymentTargetRef', 'dataRetentionPolicyRef', 'rollbackOwnerRef', 'rollbackPlanRef',
    'confirmationStatus', 'productionReadiness',
  ];
  const pendingDecisionFields = [
    'businessInputPackage', 'businessOwnerRef', 'finalApproverRef', 'knowledgeSourceRef',
    'knowledgeVersion', 'knowledgeEffectiveAt', 'agentProviderRef', 'staffIdentityRef',
    'deploymentTargetRef', 'dataRetentionPolicyRef', 'rollbackOwnerRef', 'rollbackPlanRef',
  ];

  safeCase('N29-T01', () => {
    for (const field of fields) assert(template.includes(`${field}:`));
  });
  safeCase('N29-T02', () => {
    for (const field of pendingDecisionFields) assert(template.includes(`${field}: <PENDING>`));
  });
  safeCase('N29-T03', () => {
    assert(template.includes('confirmationStatus: PENDING_CONFIRMATION'));
    assert(template.includes('productionReadiness: NOT_READY'));
  });
  safeCase('N29-T04', () => {
    const sensitivePattern = /(sk-[A-Za-z0-9]|postgresql:\/\/[^\s@]+@|https?:\/\/|C:\\|D:\\)/u;
    assert(!sensitivePattern.test(template));
    assert(!/(customer|credential|password|token|secret)/iu.test(template.replace('credentials', '')));
  });
  safeCase('N29-T05', () => {
    assert(template.includes('contentSha256: <PENDING>'));
    assert(template.includes('canonicalSha256: <PENDING>'));
  });
  safeCase('N29-T06', () => {
    assert(template.includes('businessInputPackage: <PENDING>'));
    assert(template.includes('finalApproverRef: <PENDING>'));
  });
  safeCase('N29-T07', () => {
    assert(template.includes('knowledgeSourceRef: <PENDING>'));
    assert(template.includes('knowledgeVersion: <PENDING>'));
    assert(template.includes('knowledgeEffectiveAt: <PENDING>'));
  });
  safeCase('N29-T08', () => assert(template.includes('agentProviderRef: <PENDING>')));
  safeCase('N29-T09', () => assert(template.includes('staffIdentityRef: <PENDING>')));
  safeCase('N29-T10', () => assert(template.includes('deploymentTargetRef: <PENDING>')));
  safeCase('N29-T11', () => assert(template.includes('dataRetentionPolicyRef: <PENDING>')));
  safeCase('N29-T12', () => {
    assert(template.includes('rollbackOwnerRef: <PENDING>'));
    assert(template.includes('rollbackPlanRef: <PENDING>'));
  });
  safeCase('N29-T13', () => {
    const result = runReadiness('production');
    assert(result.exitCode === 1 && result.report.status === 'NOT_READY');
    assert(result.report.reasonCodes.includes('BUSINESS_NOT_PRODUCTION_READY'));
    assert(result.report.reasonCodes.includes('SYNTHETIC_NOT_PRODUCTION'));
    assert(publishSource.includes('readiness-target'));
    assert(publishSource.includes('Business readiness rejected'));
    assert(adr.includes('ALLOW_KNOWLEDGE_PUBLISH'));
  });
  safeCase('N29-T14', () => {
    const result = runReadiness('local_eval');
    assert(result.exitCode === 0 && result.report.status === 'LOCAL_EVAL_READY' && result.report.reasonCodes.length === 0);
  });
  safeCase('N29-T15', () => {
    const result = runReadiness('rehearsal');
    assert(result.exitCode === 0 && result.report.status === 'REHEARSAL_READY' && result.report.reasonCodes.length === 0);
  });

  assert(packageJson.scripts['test:langgraph-lab'].includes('run-n29-eval.mjs'));
  assert(acceptance.includes('15 cases') && runbook.includes('N29'));
  if (process.exitCode) process.exit(1);
} catch {
  console.log(JSON.stringify({ caseId: 'N29-BOOTSTRAP', status: 'failed', reasonCode: 'N29_EVAL_FAILED' }));
  process.exitCode = 1;
}
