import { spawn, spawnSync } from 'node:child_process';

const baseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3011';
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for the production API smoke test');
}

const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const childProcesses = new Set();
let lastApiOutput = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function sleep(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function requestJson(path, options) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Expected JSON from ${path}, received HTTP ${response.status}`);
  }
  return { response, body };
}

async function waitForHealth() {
  const deadline = Date.now() + 30_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const { response } = await requestJson('/api/v1/health');
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }
  throw new Error(
    `API did not become healthy: ${lastError?.message ?? 'timeout'}\n${lastApiOutput.join('').slice(-2_000)}`,
  );
}

function startApi() {
  lastApiOutput = [];
  const child = spawn(pnpmCommand, ['--filter', '@ai-agent/api', 'start'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      PORT: new URL(baseUrl).port,
      WEB_ORIGIN: 'http://127.0.0.1:3000',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
    windowsHide: true,
  });
  child.stdout.on('data', (chunk) => lastApiOutput.push(String(chunk)));
  child.stderr.on('data', (chunk) => lastApiOutput.push(String(chunk)));
  childProcesses.add(child);
  return child;
}

async function stopApi(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], {
      stdio: 'ignore',
      windowsHide: true,
    });
  } else {
    child.kill('SIGTERM');
  }
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    sleep(5_000),
  ]);
}

let api;
try {
  api = startApi();
  await waitForHealth();

  const created = await requestJson('/api/v1/conversations', { method: 'POST' });
  assert(created.response.status === 201, `conversation creation returned HTTP ${created.response.status}`);
  const { conversationId, accessToken } = created.body;
  assert(conversationId && accessToken, 'conversation creation did not return credentials');

  const sent = await requestJson(`/api/v1/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ content: 'production smoke question' }),
  });
  assert(sent.response.status === 201, `message creation returned HTTP ${sent.response.status}`);
  assert(sent.body.messages?.length === 2, 'message creation did not return user and agent messages');

  const denied = await requestJson(`/api/v1/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { authorization: 'Bearer invalid-token', 'content-type': 'application/json' },
    body: JSON.stringify({ content: 'must be rejected' }),
  });
  assert(denied.response.status === 401, `invalid credentials returned HTTP ${denied.response.status}`);

  await stopApi(api);
  api = startApi();
  await waitForHealth();

  const afterRestart = await requestJson(`/api/v1/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ content: 'after production restart' }),
  });
  assert(afterRestart.response.status === 201, `post-restart message returned HTTP ${afterRestart.response.status}`);
  assert(afterRestart.body.messages?.length === 2, 'post-restart response did not return the new user and agent messages');

  console.log('production API smoke passed: health, create, message, invalid credentials, restart persistence');
} finally {
  for (const child of childProcesses) await stopApi(child);
}
