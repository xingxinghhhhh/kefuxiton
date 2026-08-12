import { Controller, Get, Header } from '@nestjs/common';
import type { HealthLiveResponse } from '@ai-agent/contracts';
import { HealthService } from './health.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  getHealth() {
    return { status: 'ok', service: 'api' };
  }

  @Get('live')
  @Header('Cache-Control', 'no-store')
  getLive(): HealthLiveResponse {
    return this.health.getLive();
  }

  @Get('ready')
  @Header('Cache-Control', 'no-store')
  getReady() {
    return this.health.getReady();
  }
}
