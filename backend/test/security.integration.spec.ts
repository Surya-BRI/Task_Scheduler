import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createIntegrationApp } from './integration-app.factory';

describe('Security integration', () => {
  let app: INestApplication;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeAll(async () => {
    app = await createIntegrationApp();
  });

  afterAll(async () => {
    process.env.NODE_ENV = originalNodeEnv;
    await app.close();
  });

  it('hides registration endpoint in production', async () => {
    process.env.NODE_ENV = 'production';
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'attacker@example.com',
        password: 'password123',
        fullName: 'Attacker',
        role: 'HOD',
      })
      .expect(404);
  });

  it('rejects login payloads with unexpected fields (whitelist)', async () => {
    process.env.NODE_ENV = 'test';
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'user@example.com',
        password: 'password123',
        role: 'HOD',
      })
      .expect(400);
  });

  it('rejects tampered bearer tokens', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer not.a.valid.jwt')
      .expect(401);
  });
});
