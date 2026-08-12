import { Test } from '@nestjs/testing';
import { ExpressAdapter } from '@nestjs/platform-express';
import type { HealthReadyResponse } from '@ai-agent/contracts';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/http-exception.filter.js';
import { HealthController } from '../src/modules/health/health.controller.js';
import type { HealthDatabaseProbe, HealthProbeResult } from '../src/modules/health/health.database-probe.js';
import { HealthService } from '../src/modules/health/health.service.js';
import { HEALTH_DATABASE_PROBE, HEALTH_RUNTIME_MODE } from '../src/modules/health/health.tokens.js';

describe('health HTTP boundary', () => {
  async function createApp(result: HealthProbeResult) {
    const probe: HealthDatabaseProbe = { check: async () => result };
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        HealthService,
        { provide: HEALTH_DATABASE_PROBE, useValue: probe },
        { provide: HEALTH_RUNTIME_MODE, useValue: 'rehearsal' },
      ],
    }).compile();
    const app = moduleRef.createNestApplication(new ExpressAdapter());
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    return app;
  }

  it('keeps the legacy endpoint and exposes liveness/readiness without sensitive data', async () => {
    const app = await createApp({ ok: true });
    try {
      const legacy = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
      expect(legacy.body).toEqual({ status: 'ok', service: 'api' });

      const live = await request(app.getHttpServer()).get('/api/v1/health/live').expect(200);
      expect(live.body).toEqual({ status: 'ok', check: 'liveness', service: 'api', mode: 'rehearsal' });
      expect(live.headers['cache-control']).toBe('no-store');

      const ready = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);
      const body = ready.body as HealthReadyResponse;
      expect(body).toEqual({ status: 'ready', check: 'readiness', service: 'api', mode: 'rehearsal' });
      expect(ready.headers['cache-control']).toBe('no-store');
      expect(JSON.stringify(body)).not.toMatch(/DATABASE_URL|password|token|secret|\\\\|\//i);
    } finally {
      await app.close();
    }
  });

  it('maps database failure to a redacted 503 response', async () => {
    const app = await createApp({ ok: false, reasonCode: 'DATABASE_UNAVAILABLE' });
    try {
      const response = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(503);
      expect(response.body.error.code).toBe('DATABASE_UNAVAILABLE');
      expect(response.body.error.message).toBeDefined();
      expect(JSON.stringify(response.body)).not.toMatch(/postgres|password|token|secret|stack|path/i);
    } finally {
      await app.close();
    }
  });
});
