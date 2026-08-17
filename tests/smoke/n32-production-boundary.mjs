import { createServer, createConnection } from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../..', import.meta.url));
const apiEntry = join(root, 'apps', 'api', 'dist', 'main.js');
const secretValues = [
  'n32-secret-user',
  'n32-secret-password',
  'n32-test-only-token',
  'n32-test-operator',
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function findFreePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert(address && typeof address === 'object', 'free port lookup failed');
  const port = address.port;
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return port;
}

async function portIsListening(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    let settled = false;
    const finish = (listening) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(listening);
    };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    setTimeout(() => finish(false), 500);
  });
}

function terminate(child) {
  if (child.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], {
      stdio: 'ignore',
      windowsHide: true,
    });
  } else {
    child.kill('SIGTERM');
  }
}

async function runApi(environment) {
  const port = await findFreePort();
  const child = spawn(process.execPath, ['--no-warnings', apiEntry], {
    cwd: root,
    env: { ...process.env, ...environment, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += String(chunk); });
  child.stderr.on('data', (chunk) => { output += String(chunk); });

  let timeoutHandle;
  const result = await Promise.race([
    new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal, timedOut: false }))),
    new Promise((resolve) => { timeoutHandle = setTimeout(() => resolve({ code: null, signal: null, timedOut: true }), 8_000); }),
  ]);
  clearTimeout(timeoutHandle);
  if (result.timedOut) terminate(child);
  const listening = await portIsListening(port);
  return { ...result, listening, output };
}

function assertRedacted(output) {
  for (const secret of secretValues) assert(!output.includes(secret), 'startup output leaked a test value');
  assert(!/postgres(?:ql)?:\/\/|D:\\AI\\AI agent|node_modules|node:internal|stack|customer content/iu.test(output), 'startup output crossed the safe boundary');
}

const baseEnvironment = {
  APP_ENV: 'production',
  WEB_ORIGIN: 'https://support.example.test',
  DATABASE_URL: 'postgresql://n32-secret-user:n32-secret-password@127.0.0.1:1/n32_readiness',
  NEXT_PUBLIC_API_BASE_URL: 'https://api.example.test/api/v1',
  STAFF_AUTH_MODE: 'deny',
  ALLOW_KNOWLEDGE_PUBLISH: '0',
};

const caseName = process.argv.find((argument) => argument.startsWith('--case='))?.slice('--case='.length);
const environments = {
  'production-ready-gate': baseEnvironment,
  'production-test-staff': {
    ...baseEnvironment,
    STAFF_AUTH_MODE: 'test',
    AI_AGENT_TEST_STAFF_TOKEN: 'n32-test-only-token',
    AI_AGENT_TEST_STAFF_ID: 'n32-test-operator',
  },
  'production-publish-flag': { ...baseEnvironment, ALLOW_KNOWLEDGE_PUBLISH: '1' },
  'production-arbitrary-flags': {
    ...baseEnvironment,
    AGENT_PROVIDER: 'production-provider',
    STAFF_IDENTITY: 'production-staff-identity',
    DEPLOYMENT_TARGET: 'production-target',
    READINESS_STATUS: 'PRODUCTION_READY',
  },
  'production-config-redaction': {
    ...baseEnvironment,
    STAFF_AUTH_MODE: 'test',
    AI_AGENT_TEST_STAFF_TOKEN: 'n32-test-only-token',
    AI_AGENT_TEST_STAFF_ID: 'n32-test-operator',
  },
};

if (!caseName || !environments[caseName]) throw new Error('N32 smoke case is required');

const result = await runApi(environments[caseName]);
assert(result.code !== 0, 'production API unexpectedly exited successfully');
assert(!result.timedOut, 'production API did not fail closed promptly');
assert(!result.listening, 'production API listened before readiness was accepted');
assertRedacted(result.output);

if (caseName === 'production-ready-gate' || caseName === 'production-arbitrary-flags') {
  assert(result.output.includes('API production readiness rejected'), 'production readiness rejection was not reported');
  for (const reasonCode of [
    'BUSINESS_NOT_PRODUCTION_READY',
    'KNOWLEDGE_SOURCE_NOT_APPROVED',
    'SYNTHETIC_NOT_PRODUCTION',
    'STAFF_IDENTITY_NOT_CONFIGURED',
    'AGENT_PROVIDER_NOT_CONFIGURED',
    'DEPLOYMENT_TARGET_NOT_CONFIGURED',
  ]) assert(result.output.includes(reasonCode), 'production blocker was not reported');
}

if (caseName === 'production-test-staff' || caseName === 'production-config-redaction') {
  assert(result.output.includes('CONFIG_FORBIDDEN_IN_ENV') || result.output.includes('CONFIG_SECRET_FORBIDDEN'), 'test Staff configuration was not rejected');
}

if (caseName === 'production-publish-flag') {
  assert(result.output.includes('CONFIG_FORBIDDEN_IN_ENV'), 'knowledge publish flag was not rejected');
}

console.log(`N32 production boundary smoke passed: ${caseName}`);
