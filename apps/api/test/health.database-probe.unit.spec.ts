import type { PrismaService } from '../src/prisma/prisma.service.js';
import { HEALTH_PROBE_TIMEOUT_MS, PrismaHealthDatabaseProbe } from '../src/modules/health/health.database-probe.js';

describe('Prisma health database probe', () => {
  function probe(queryRaw: () => Promise<unknown>) {
    // The fake implements only the read-only Prisma method used by this adapter.
    return new PrismaHealthDatabaseProbe({ $queryRaw: queryRaw } as unknown as PrismaService);
  }

  it('executes the read-only query and reports success', async () => {
    const queryRaw = jest.fn(async () => [{ 1: 1 }]);
    await expect(probe(queryRaw).check()).resolves.toEqual({ ok: true });
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('maps an initialization failure to database unavailable', async () => {
    const error = Object.assign(new Error('connection details must stay private'), { name: 'PrismaClientInitializationError' });
    await expect(probe(async () => { throw error; }).check()).resolves.toEqual({ ok: false, reasonCode: 'DATABASE_UNAVAILABLE' });
  });

  it('maps a slow query to database timeout at the fixed deadline', async () => {
    const started = Date.now();
    const result = await probe(() => new Promise(() => undefined)).check();
    expect(result).toEqual({ ok: false, reasonCode: 'DATABASE_TIMEOUT' });
    expect(Date.now() - started).toBeGreaterThanOrEqual(HEALTH_PROBE_TIMEOUT_MS - 50);
  }, HEALTH_PROBE_TIMEOUT_MS + 500);
});
