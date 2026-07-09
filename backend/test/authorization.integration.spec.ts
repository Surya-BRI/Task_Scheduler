import { CanActivate, ExecutionContext, INestApplication, Injectable } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import request from 'supertest';
import { NotificationsController } from '../src/notifications/notifications.controller';
import { NotificationsService } from '../src/notifications/notifications.service';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { ConfigModule } from '@nestjs/config';
import configuration from '../src/config/configuration';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

@Injectable()
class TestJwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<{ headers: Record<string, string>; user?: unknown }>();
    const role = req.headers['x-test-role'];
    const userId = req.headers['x-test-user-id'] ?? 'test-user-id';
    if (!role) return false;
    req.user = {
      sub: userId,
      email: 'test@example.com',
      role,
    };
    return true;
  }
}

describe('Authorization integration', () => {
  let app: INestApplication;
  const notificationsService = {
    findForUser: jest.fn(),
    markRead: jest.fn(),
    countUnread: jest.fn(),
  };

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = 'integration-test-jwt-secret';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret: process.env.JWT_ACCESS_SECRET }),
      ],
      controllers: [NotificationsController],
      providers: [
        JwtStrategy,
        { provide: NotificationsService, useValue: notificationsService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(TestJwtAuthGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    notificationsService.findForUser.mockResolvedValue([]);
  });

  it('rejects unauthenticated notification listing', async () => {
    await request(app.getHttpServer()).get('/api/v1/notifications').expect(403);
  });

  it('scopes notification listing to the authenticated user', async () => {
    const userId = 'user-a';
    notificationsService.findForUser.mockResolvedValue([{ id: 'n1', userId }]);

    const response = await request(app.getHttpServer())
      .get('/api/v1/notifications')
      .set('x-test-role', 'DESIGNER')
      .set('x-test-user-id', userId)
      .expect(200);

    expect(response.body).toEqual([{ id: 'n1', userId }]);
    expect(notificationsService.findForUser).toHaveBeenCalledWith(userId, undefined);
  });

  it('passes user id to markRead for IDOR-safe updates', async () => {
    const userId = 'user-b';
    notificationsService.markRead.mockResolvedValue({ id: 'n2', isRead: true });

    await request(app.getHttpServer())
      .patch('/api/v1/notifications/n2/read')
      .set('x-test-role', 'DESIGNER')
      .set('x-test-user-id', userId)
      .expect(200);

    expect(notificationsService.markRead).toHaveBeenCalledWith('n2', userId);
  });
});
