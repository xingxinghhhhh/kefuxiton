import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

export const HEALTH_PROBE_TIMEOUT_MS = 1_000;

export type HealthProbeReasonCode = 'DATABASE_UNAVAILABLE' | 'DATABASE_TIMEOUT' | 'INTERNAL_HEALTH_FAILURE';

export type HealthProbeResult = { ok: true } | { ok: false; reasonCode: HealthProbeReasonCode };

export interface HealthDatabaseProbe {
  check(): Promise<HealthProbeResult>;
}

class HealthProbeTimeoutError extends Error {
  constructor() {
    super('health probe timed out');
    this.name = 'HealthProbeTimeoutError';
  }
}

function isHealthProbeTimeoutError(error: unknown): error is HealthProbeTimeoutError {
  return error instanceof HealthProbeTimeoutError;
}

function prismaErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('code' in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

@Injectable()
export class PrismaHealthDatabaseProbe implements HealthDatabaseProbe {
  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<HealthProbeResult> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new HealthProbeTimeoutError()), HEALTH_PROBE_TIMEOUT_MS);
        }),
      ]);
      return { ok: true };
    } catch (error) {
      if (isHealthProbeTimeoutError(error)) return { ok: false, reasonCode: 'DATABASE_TIMEOUT' };
      if (error instanceof Error && error.name === 'PrismaClientInitializationError') {
        return { ok: false, reasonCode: 'DATABASE_UNAVAILABLE' };
      }
      const code = prismaErrorCode(error);
      if (code === 'P2024') return { ok: false, reasonCode: 'DATABASE_TIMEOUT' };
      if (['P1001', 'P1002', 'P1008', 'P1017'].includes(code ?? '')) {
        return { ok: false, reasonCode: 'DATABASE_UNAVAILABLE' };
      }
      return { ok: false, reasonCode: 'INTERNAL_HEALTH_FAILURE' };
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}
