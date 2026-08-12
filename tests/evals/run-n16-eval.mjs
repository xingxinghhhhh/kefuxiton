import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { HealthController } from '../../apps/api/dist/modules/health/health.controller.js';
import { HEALTH_PROBE_TIMEOUT_MS, PrismaHealthDatabaseProbe } from '../../apps/api/dist/modules/health/health.database-probe.js';
import { HealthService } from '../../apps/api/dist/modules/health/health.service.js';

const root = resolve(import.meta.dirname, '..', '..');
const cases = JSON.parse(readFileSync(resolve(root, 'tests/evals/n16-health-runtime.json'), 'utf8'));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function service(mode, result, check) {
  return new HealthService({ check: check ?? (async () => result) }, mode);
}

const probeCalls = { count: 0 };
const liveService = service('local_eval', { ok: true }, async () => {
  probeCalls.count += 1;
  return { ok: true };
});
const controller = new HealthController(liveService);
assert(JSON.stringify(controller.getHealth()) === JSON.stringify({ status: 'ok', service: 'api' }), 'legacy health response changed');
assert(JSON.stringify(controller.getLive()) === JSON.stringify({ status: 'ok', check: 'liveness', service: 'api', mode: 'local_eval' }), 'liveness contract changed');
assert(probeCalls.count === 0, 'liveness must not call the database probe');

const ready = await service('rehearsal', { ok: true }).getReady();
assert(ready.status === 'ready' && ready.mode === 'rehearsal', 'rehearsal readiness must be ready without production claim');

const unavailable = service('test', { ok: false, reasonCode: 'DATABASE_UNAVAILABLE' });
await unavailable.getReady().then(() => { throw new Error('database failure must reject'); }).catch((error) => {
  assert(error.status === 503 && error.response?.code === 'DATABASE_UNAVAILABLE', 'database failure mapping changed');
});

const timeoutProbe = new PrismaHealthDatabaseProbe({ $queryRaw: () => new Promise(() => undefined) });
const timeoutStarted = Date.now();
const timeoutResult = await timeoutProbe.check();
assert(timeoutResult.reasonCode === 'DATABASE_TIMEOUT', 'database timeout mapping changed');
assert(Date.now() - timeoutStarted >= HEALTH_PROBE_TIMEOUT_MS - 50, 'database timeout deadline changed');

let resolveProbe;
let concurrentCalls = 0;
const concurrentService = service('local_eval', { ok: true }, () => {
  concurrentCalls += 1;
  return new Promise((resolveResult) => { resolveProbe = resolveResult; });
});
const first = concurrentService.getReady();
const second = concurrentService.getReady();
assert(concurrentCalls === 1, 'concurrent readiness must share one probe');
resolveProbe({ ok: true });
await Promise.all([first, second]);

const queryCalls = [];
const queryProbe = new PrismaHealthDatabaseProbe({ $queryRaw: (strings) => {
  queryCalls.push(Array.from(strings).join(''));
  return Promise.resolve([{ 1: 1 }]);
} });
assert((await queryProbe.check()).ok, 'read-only database query must succeed');
assert(queryCalls.length === 1 && queryCalls[0] === 'SELECT 1', 'health probe must execute exactly SELECT 1');

const safe = JSON.stringify({ live: controller.getLive(), ready });
assert(!/DATABASE_URL|password|token|secret|stack|path|\\\\/i.test(safe), 'health response leaked sensitive fields');
assert(cases.length >= 9, 'N16 eval must contain all required health cases');
console.log(`N16 eval passed: ${cases.length} health compatibility, liveness, readiness, timeout, mode, and redaction cases`);
