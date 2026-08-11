import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runPreflight } from '../../packages/config/dist/index.js';

const root = fileURLToPath(new URL('../..', import.meta.url));
const validEnvironment = {
  APP_ENV: 'test',
  PORT: '3001',
  WEB_ORIGIN: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://test-user:test-password@localhost:5432/test-db?schema=test',
  NEXT_PUBLIC_API_BASE_URL: 'http://localhost:3001/api/v1',
  STAFF_AUTH_MODE: 'test',
  AI_AGENT_TEST_STAFF_TOKEN: 'test-only-staff-token',
  ALLOW_KNOWLEDGE_PUBLISH: '0',
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runApiWithEnvironment(environment) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['apps/api/dist/main.js'], {
      cwd: root,
      env: { ...process.env, ...environment },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let output = '';
    child.stdout.on('data', (chunk) => { output += String(chunk); });
    child.stderr.on('data', (chunk) => { output += String(chunk); });
    child.once('error', reject);
    child.once('exit', (code) => resolve({ code, output }));
  });
}

const valid = runPreflight(validEnvironment);
assert(valid.ok, 'complete synthetic test configuration must pass preflight');

const productionTestMode = runPreflight({
  ...validEnvironment,
  APP_ENV: 'production',
  WEB_ORIGIN: 'https://support.example.test',
  NEXT_PUBLIC_API_BASE_URL: 'https://api.example.test/api/v1',
  STAFF_AUTH_MODE: 'test',
  ALLOW_KNOWLEDGE_PUBLISH: '1',
});
assert(!productionTestMode.ok, 'production must reject test-only capabilities');

const startup = await runApiWithEnvironment({
  APP_ENV: 'production',
  PORT: '3999',
  WEB_ORIGIN: 'https://support.example.test',
  DATABASE_URL: 'postgresql://test-user:test-password@localhost:5432/test-db',
  STAFF_AUTH_MODE: 'test',
  AI_AGENT_TEST_STAFF_TOKEN: 'test-only-staff-token',
  ALLOW_KNOWLEDGE_PUBLISH: '0',
});
assert(startup.code !== 0, 'API must fail before listening when production enables test Staff auth');
assert(startup.output.includes('CONFIG_FORBIDDEN_IN_ENV') && startup.output.includes('CONFIG_SECRET_FORBIDDEN'), 'startup failure must expose safe error codes');
assert(!startup.output.includes('test-password') && !startup.output.includes('test-only-staff-token'), 'startup failure must not expose secrets');

console.log('configuration preflight smoke passed: matrix, production fail-closed, and startup redaction');
