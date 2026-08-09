import { Test } from '@nestjs/testing';
import { HealthController } from '../src/modules/health/health.controller.js';

describe('health integration boundary', () => {
  it('exposes a stable health response from the Nest module boundary', async () => {
    const moduleRef = await Test.createTestingModule({ controllers: [HealthController] }).compile();
    const controller = moduleRef.get(HealthController);
    expect(controller.getHealth()).toEqual({ status: 'ok', service: 'api' });
  });
});
