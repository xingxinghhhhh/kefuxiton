import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';

const requireFromApi = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { PrismaClient } = requireFromApi('@prisma/client');
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const inputDatabaseUrl = process.env.DATABASE_URL ?? 'postgresql://ai_agent:ai_agent_dev_only@localhost:5432/ai_customer_service?schema=public';
const externalSchema = process.env.E2E_EXTERNAL_SCHEMA === '1';
const schema = process.env.E2E_SCHEMA ?? `e2e_${Date.now()}_${process.pid}`;
if (externalSchema && !/^e2e_[a-zA-Z0-9_]+$|^release_rehearsal_[a-zA-Z0-9_]+$/.test(schema)) {
  throw new Error('E2E schema reference is invalid');
}
const isolatedUrl = new URL(inputDatabaseUrl);
isolatedUrl.searchParams.set('schema', schema);
const databaseUrl = isolatedUrl.toString();
const admin = new PrismaClient({ datasources: { db: { url: inputDatabaseUrl } } });
let adminDisconnected = false;

function run(command, args, env) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    windowsHide: true,
  });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed`);
}

try {
  if (!externalSchema) await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  await admin.$disconnect();
  adminDisconnected = true;
  if (!externalSchema) run(pnpmCommand, ['--filter', '@ai-agent/api', 'db:migrate'], { ...process.env, DATABASE_URL: databaseUrl });
  if (!existsSync('apps/api/dist/main.js')) {
    run(pnpmCommand, ['--filter', '@ai-agent/api', 'build'], { ...process.env, DATABASE_URL: databaseUrl });
  }
  run(pnpmCommand, ['--filter', '@ai-agent/web', 'exec', 'playwright', 'test'], {
    ...process.env,
    DATABASE_URL: databaseUrl,
  });
} finally {
  if (!adminDisconnected) await admin.$disconnect();
  if (!externalSchema) {
    const cleanup = new PrismaClient({ datasources: { db: { url: inputDatabaseUrl } } });
    await cleanup.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await cleanup.$disconnect();
  }
}
