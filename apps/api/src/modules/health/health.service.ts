import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { HealthLiveResponse, HealthReadyResponse, HealthRuntimeMode } from '@ai-agent/contracts';
import { HEALTH_DATABASE_PROBE, HEALTH_RUNTIME_MODE } from './health.tokens.js';
import type { HealthDatabaseProbe, HealthProbeResult } from './health.database-probe.js';

@Injectable()
export class HealthService {
  private readinessProbe: Promise<HealthProbeResult> | null = null;

  constructor(
    @Inject(HEALTH_DATABASE_PROBE) private readonly databaseProbe: HealthDatabaseProbe,
    @Inject(HEALTH_RUNTIME_MODE) private readonly mode: HealthRuntimeMode,
  ) {}

  getLive(): HealthLiveResponse {
    return { status: 'ok', check: 'liveness', service: 'api', mode: this.mode };
  }

  async getReady(): Promise<HealthReadyResponse> {
    const result = await this.runDatabaseProbe();
    if (!result.ok) throw new ServiceUnavailableException({ code: result.reasonCode });
    return { status: 'ready', check: 'readiness', service: 'api', mode: this.mode };
  }

  private runDatabaseProbe(): Promise<HealthProbeResult> {
    if (!this.readinessProbe) {
      this.readinessProbe = this.databaseProbe.check().finally(() => {
        this.readinessProbe = null;
      });
    }
    return this.readinessProbe;
  }
}
