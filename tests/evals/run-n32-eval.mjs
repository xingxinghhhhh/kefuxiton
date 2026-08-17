import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const smokePath = join(root, 'tests', 'smoke', 'n32-production-boundary.mjs');

function readText(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function assert(condition) {
  if (!condition) throw new Error('assertion failed');
}

function runSmoke(caseName) {
  const result = spawnSync(process.execPath, [smokePath, `--case=${caseName}`], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });
  assert(result.status === 0);
  assert(!/postgres(?:ql)?:\/\/|D:\\AI\\AI agent|node_modules|node:internal|stack|token|password/iu.test(`${result.stdout ?? ''}${result.stderr ?? ''}`));
}

function runReadiness(target, environment = {}) {
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
      ...environment,
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
    console.log(JSON.stringify({ caseId, status: 'failed', reasonCode: 'N32_EVAL_FAILED' }));
    process.exitCode = 1;
  }
}

try {
  const cases = readJson('tests/evals/n32-production-boundary.json');
  const packageJson = readJson('package.json');
  const mainSource = readText('apps/api/src/main.ts');
  const readinessSource = readText('scripts/release-readiness.mjs');
  const rehearsalSource = readText('scripts/run-release-rehearsal.mjs');
  const smokeSource = readText('tests/smoke/n32-production-boundary.mjs');
  const acceptance = readText('docs/N32-acceptance.md');
  const adr = readText('docs/adr/0030-N32生产门禁不可绕过与rehearsal隔离.md');
  const runbook = readText('docs/运行手册.md');

  assert(cases.length === 12);
  assert(new Set(cases.map((testCase) => testCase.id)).size === 12);
  assert(cases.filter((testCase) => testCase.category === 'production-readiness').length === 3);
  assert(cases.filter((testCase) => testCase.category === 'startup-boundary').length === 2);
  assert(cases.filter((testCase) => testCase.category === 'bypass-resistance').length === 3);
  assert(cases.filter((testCase) => testCase.category === 'redaction').length === 2);
  assert(cases.filter((testCase) => testCase.category === 'runtime-mode').length === 2);
  assert(existsSync(smokePath));
  const nestFactoryIndex = mainSource.indexOf('NestFactory.create');
  const listenIndex = mainSource.indexOf('app.listen');
  assert(mainSource.includes('evaluateReleaseReadiness'));
  assert(nestFactoryIndex > 0 && listenIndex > nestFactoryIndex);
  assert(mainSource.includes("if (config.appEnv === 'production')"));
  assert(readinessSource.includes('reasonCodes'));
  assert(rehearsalSource.includes("APP_ENV: 'rehearsal'"));
  assert(rehearsalSource.includes("STAFF_AUTH_MODE: 'deny'"));
  assert(rehearsalSource.includes("stage: 'cleanup'"));
  assert(rehearsalSource.includes('CLEANUP_FAILED'));
  assert(smokeSource.includes('production'));
  assert(packageJson.scripts['test:langgraph-lab'].includes('run-n32-eval.mjs'));
  assert(acceptance.includes('exactly 12 cases'));
  assert(adr.includes('禁止修改生产源码'));
  assert(runbook.includes('N32'));

  safeCase('N32-T01', () => {
    const result = runReadiness('production');
    assert(result.exitCode === 1 && result.report.status === 'NOT_READY');
  });
  safeCase('N32-T02', () => {
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
  safeCase('N32-T03', () => {
    const result = runReadiness('production', {
      STAFF_AUTH_MODE: 'test',
      AI_AGENT_TEST_STAFF_TOKEN: 'n32-test-only-token',
      AI_AGENT_TEST_STAFF_ID: 'n32-test-operator',
      ALLOW_KNOWLEDGE_PUBLISH: '1',
    });
    assert(result.exitCode === 1 && result.report.status === 'NOT_READY');
  });
  safeCase('N32-T04', () => runSmoke('production-ready-gate'));
  safeCase('N32-T05', () => runSmoke('production-config-redaction'));
  safeCase('N32-T06', () => runSmoke('production-test-staff'));
  safeCase('N32-T07', () => runSmoke('production-publish-flag'));
  safeCase('N32-T08', () => runSmoke('production-arbitrary-flags'));
  safeCase('N32-T09', () => runSmoke('production-ready-gate'));
  safeCase('N32-T10', () => runSmoke('production-config-redaction'));
  safeCase('N32-T11', () => {
    const result = runReadiness('local_eval');
    assert(result.exitCode === 0 && result.report.status === 'LOCAL_EVAL_READY' && result.report.reasonCodes.length === 0);
  });
  safeCase('N32-T12', () => {
    const result = runReadiness('rehearsal');
    assert(result.exitCode === 0 && result.report.status === 'REHEARSAL_READY' && result.report.reasonCodes.length === 0);
  });

  if (process.exitCode) process.exit(1);
} catch {
  console.log(JSON.stringify({ caseId: 'N32-BOOTSTRAP', status: 'failed', reasonCode: 'N32_EVAL_FAILED' }));
  process.exitCode = 1;
}
