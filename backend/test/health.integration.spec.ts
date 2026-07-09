import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { HealthModule } from '../src/health/health.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

describe('Health integration', () => {
  let app: INestApplication;
  const prisma = {
    $queryRaw: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [HealthModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('GET /health returns liveness without touching the database', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(response.body.status).toBe('ok');
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('GET /health/ready returns 200 when database is healthy', async () => {
    prisma.$queryRaw.mockResolvedValue([{ ok: 1 }]);
    const response = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.checks.database.status).toBe('ok');
  });

  it('GET /health/ready returns 503 when database is unavailable', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('db down'));
    const response = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(503);
    const payload = response.body.message ?? response.body;
    expect(payload.checks.database.status).toBe('unavailable');
  });
});
