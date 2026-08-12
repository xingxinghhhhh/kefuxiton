import { Module } from '@nestjs/common';
import type { AppEnvironment } from '@ai-agent/config';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { PrismaHealthDatabaseProbe } from './health.database-probe.js';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';
import { HEALTH_DATABASE_PROBE, HEALTH_RUNTIME_MODE } from './health.tokens.js';

const APP_ENVIRONMENTS: readonly AppEnvironment[] = ['development', 'test', 'local_eval', 'rehearsal', 'production'];

function getRuntimeMode(): AppEnvironment {
  const value = process.env.APP_ENV;
  return APP_ENVIRONMENTS.includes(value as AppEnvironment) ? value as AppEnvironment : 'development';
}

@Module({
  imports: [PrismaModule],
  controllers: [HealthController],
  providers: [
    PrismaHealthDatabaseProbe,
    HealthService,
    { provide: HEALTH_DATABASE_PROBE, useExisting: PrismaHealthDatabaseProbe },
    { provide: HEALTH_RUNTIME_MODE, useFactory: getRuntimeMode },
  ],
})
export class HealthModule {}
