import { HealthService } from '../src/modules/health/health.service.js';
import type { HealthDatabaseProbe, HealthProbeResult } from '../src/modules/health/health.database-probe.js';

describe('health service', () => {
  function createService(result: HealthProbeResult, check = jest.fn(async () => result)) {
    const probe: HealthDatabaseProbe = { check };
    return { service: new HealthService(probe, 'local_eval'), check };
  }

  it('returns liveness without invoking the database probe', () => {
    const { service, check } = createService({ ok: true });
    expect(service.getLive()).toEqual({ status: 'ok', check: 'liveness', service: 'api', mode: 'local_eval' });
    expect(check).not.toHaveBeenCalled();
  });

  it('shares one in-flight readiness probe across concurrent requests', async () => {
    let resolveProbe: ((result: HealthProbeResult) => void) | undefined;
    const check = jest.fn(() => new Promise<HealthProbeResult>((resolve) => { resolveProbe = resolve; }));
    const probe: HealthDatabaseProbe = { check };
    const service = new HealthService(probe, 'rehearsal');
    const first = service.getReady();
    const second = service.getReady();
    expect(check).toHaveBeenCalledTimes(1);
    resolveProbe?.({ ok: true });
    await expect(Promise.all([first, second])).resolves.toEqual([
      { status: 'ready', check: 'readiness', service: 'api', mode: 'rehearsal' },
      { status: 'ready', check: 'readiness', service: 'api', mode: 'rehearsal' },
    ]);
  });

  it('maps timeout and internal probe failures without exposing details', async () => {
    const timeout = createService({ ok: false, reasonCode: 'DATABASE_TIMEOUT' }).service;
    await expect(timeout.getReady()).rejects.toMatchObject({ response: { code: 'DATABASE_TIMEOUT' }, status: 503 });
    const internal = createService({ ok: false, reasonCode: 'INTERNAL_HEALTH_FAILURE' }).service;
    await expect(internal.getReady()).rejects.toMatchObject({ response: { code: 'INTERNAL_HEALTH_FAILURE' }, status: 503 });
  });
});
