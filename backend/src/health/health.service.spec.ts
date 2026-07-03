import { ServiceUnavailableException } from '@nestjs/common';
import { HealthService } from './health.service';

describe('HealthService', () => {
  const prisma = {
    $queryRaw: jest.fn(),
  };

  const service = new HealthService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns liveness without database checks', () => {
    const result = service.getLiveness();
    expect(result.status).toBe('ok');
    expect(result.uptime).toBeGreaterThanOrEqual(0);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('reports ready when database responds', async () => {
    prisma.$queryRaw.mockResolvedValue([{ ok: 1 }]);
    const result = await service.getReadiness();
    expect(result.status).toBe('ok');
    expect(result.checks.database.status).toBe('ok');
    expect(result.checks.database.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('reports unavailable when database fails', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('connection refused'));
    const result = await service.getReadiness();
    expect(result.status).toBe('unavailable');
    expect(result.checks.database.error).toContain('connection refused');
  });

  it('assertReady throws when database is down', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('down'));
    await expect(service.assertReady()).rejects.toThrow(ServiceUnavailableException);
  });
});
