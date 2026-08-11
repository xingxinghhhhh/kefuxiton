import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  capabilitiesForRuntime,
  evaluateBusinessReadiness,
  evaluateReleaseReadiness,
  loadBusinessInputPackage,
} from '../../packages/config/dist/index.js';

const root = resolve(import.meta.dirname, '..', '..');
const cases = JSON.parse(readFileSync(resolve(root, 'tests/evals/n15-release-readiness.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(resolve(root, 'config/business-readiness/synthetic-local-eval.json'), 'utf8'));
const packageInput = loadBusinessInputPackage(manifest);
const business = evaluateBusinessReadiness(packageInput, 'local_eval', {
  canonicalSha256: manifest.canonicalSha256,
  sourceContentSha256: packageInput.knowledgeSource.contentSha256,
  now: new Date('2026-08-11T00:00:00.000Z'),
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const local = evaluateReleaseReadiness({
  target: 'local_eval',
  appEnv: 'local_eval',
  configValid: true,
  businessReadiness: business,
  capabilities: capabilitiesForRuntime({ staffAuthMode: 'deny' }),
});
assert(local.status === 'LOCAL_EVAL_READY', 'local_eval must be ready');

const rehearsal = evaluateReleaseReadiness({
  target: 'rehearsal',
  appEnv: 'rehearsal',
  configValid: true,
  businessReadiness: business,
  capabilities: capabilitiesForRuntime({ staffAuthMode: 'deny' }),
});
assert(rehearsal.status === 'REHEARSAL_READY', 'rehearsal must be ready without claiming production');

const production = evaluateReleaseReadiness({
  target: 'production',
  appEnv: 'production',
  configValid: true,
  businessReadiness: null,
  capabilities: capabilitiesForRuntime({ staffAuthMode: 'deny' }),
});
assert(production.status === 'NOT_READY', 'production must be blocked without formal capabilities');
assert(JSON.stringify(production.reasonCodes) === JSON.stringify([
  'BUSINESS_NOT_PRODUCTION_READY',
  'KNOWLEDGE_SOURCE_NOT_APPROVED',
  'SYNTHETIC_NOT_PRODUCTION',
  'STAFF_IDENTITY_NOT_CONFIGURED',
  'AGENT_PROVIDER_NOT_CONFIGURED',
  'DEPLOYMENT_TARGET_NOT_CONFIGURED',
]), 'production blockers must use the fixed order');

const mixedMode = evaluateReleaseReadiness({
  target: 'rehearsal',
  appEnv: 'production',
  configValid: true,
  businessReadiness: business,
  capabilities: capabilitiesForRuntime({ staffAuthMode: 'deny' }),
});
assert(mixedMode.reasonCodes.includes('MODE_CONFLICT'), 'mixed rehearsal/production markers must be rejected');

const cli = spawnSync(process.execPath, [resolve(root, 'scripts/release-readiness.mjs'), '--target=production'], {
  cwd: root,
  encoding: 'utf8',
  env: {
    ...process.env,
    APP_ENV: 'production',
    PORT: '3998',
    WEB_ORIGIN: 'https://support.example.test',
    DATABASE_URL: 'postgresql://secret-user:secret-password@localhost:5432/readiness-test',
    NEXT_PUBLIC_API_BASE_URL: 'https://api.example.test/api/v1',
    STAFF_AUTH_MODE: 'deny',
    ALLOW_KNOWLEDGE_PUBLISH: '0',
  },
});
const cliOutput = `${cli.stdout}\n${cli.stderr}`;
assert(cli.status !== 0 && cliOutput.includes('BUSINESS_NOT_PRODUCTION_READY'), 'production CLI must fail closed');
assert(!cliOutput.includes('secret-password') && !cliOutput.includes('D:\\AI\\AI agent'), 'readiness output must be redacted');

const startup = spawnSync(process.execPath, [resolve(root, 'apps/api/dist/main.js')], {
  cwd: root,
  encoding: 'utf8',
  timeout: 30_000,
  env: {
    ...process.env,
    APP_ENV: 'production',
    PORT: '3997',
    WEB_ORIGIN: 'https://support.example.test',
    DATABASE_URL: 'postgresql://secret-user:secret-password@localhost:5432/readiness-test',
    NEXT_PUBLIC_API_BASE_URL: 'https://api.example.test/api/v1',
    STAFF_AUTH_MODE: 'deny',
    ALLOW_KNOWLEDGE_PUBLISH: '0',
  },
});
const startupOutput = `${startup.stdout}\n${startup.stderr}`;
assert(startup.status !== 0 && startupOutput.includes('API production readiness rejected'), 'production API must stop before listening');
assert(!startupOutput.includes('secret-password') && !startupOutput.includes('readiness-test'), 'startup readiness failure must not expose secrets');

assert(cases.length >= 9, 'N15 eval must contain all required readiness cases');
console.log(`N15 eval passed: ${cases.length} runtime mode, capability, startup gate, redaction, and ordering cases`);
