import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { UsersService } from '../src/users/users.service';
import { ACCESS_TOKEN_COOKIE } from '../src/common/constants/auth-cookie.constants';
import { createIntegrationApp, seedTestUser, TEST_USER } from './integration-app.factory';

describe('Auth integration', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createIntegrationApp();
    const usersService = app.get(UsersService);
    await seedTestUser(usersService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /auth/login rejects invalid credentials', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: TEST_USER.email, password: 'wrong-password' })
      .expect(401);
  });

  it('POST /auth/login sets httpOnly cookie and returns user', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: TEST_USER.email, password: 'password123' })
      .expect(200);

    expect(response.body.user).toMatchObject({
      id: TEST_USER.id,
      email: TEST_USER.email,
      role: 'HOD',
    });

    const cookie = response.headers['set-cookie']?.[0] ?? '';
    expect(cookie).toContain(`${ACCESS_TOKEN_COOKIE}=`);
    expect(cookie.toLowerCase()).toContain('httponly');
  });

  it('GET /auth/me requires authentication', async () => {
    await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
  });

  it('GET /auth/me returns profile when cookie is present', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: TEST_USER.email, password: 'password123' });

    const cookie = login.headers['set-cookie'];

    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', cookie)
      .expect(200);

    expect(me.body).toMatchObject({
      id: TEST_USER.id,
      email: TEST_USER.email,
    });
  });

  it('POST /auth/logout clears access cookie', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: TEST_USER.email, password: 'password123' });

    const logout = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', login.headers['set-cookie'])
      .expect(200);

    expect(logout.body).toEqual({ ok: true });
    const cleared = logout.headers['set-cookie']?.[0] ?? '';
    expect(cleared).toContain(`${ACCESS_TOKEN_COOKIE}=`);
  });
});
