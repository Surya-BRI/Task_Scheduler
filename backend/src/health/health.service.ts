import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type HealthStatus = 'ok' | 'degraded' | 'unavailable';

export type LivenessResponse = {
  status: 'ok';
  timestamp: string;
  uptime: number;
};

export type ReadinessResponse = {
  status: HealthStatus;
  timestamp: string;
  checks: {
    database: { status: HealthStatus; latencyMs?: number; error?: string };
  };
};

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  getLiveness(): LivenessResponse {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  async getReadiness(): Promise<ReadinessResponse> {
    const dbCheck = await this.checkDatabase();
    const status: HealthStatus = dbCheck.status === 'ok' ? 'ok' : 'unavailable';

    return {
      status,
      timestamp: new Date().toISOString(),
      checks: {
        database: dbCheck,
      },
    };
  }

  async assertReady(): Promise<void> {
    const readiness = await this.getReadiness();
    if (readiness.status !== 'ok') {
      throw new ServiceUnavailableException(readiness);
    }
  }

  private async checkDatabase(): Promise<{
    status: HealthStatus;
    latencyMs?: number;
    error?: string;
  }> {
    const started = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1 AS ok`;
      return { status: 'ok', latencyMs: Date.now() - started };
    } catch (err) {
      return {
        status: 'unavailable',
        latencyMs: Date.now() - started,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
