import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { ErpSessionService } from '../src/auth/erp-session.service';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { UsersService } from '../src/users/users.service';
import { UserRole } from '../src/common/constants/roles.enum';
import { ConfigModule } from '@nestjs/config';
import configuration from '../src/config/configuration';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

/** Minimal Nest app for Supertest integration tests (no database). */
export async function createIntegrationApp(): Promise<INestApplication> {
  process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'integration-test-jwt-secret';
  process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
  process.env.CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:5000';

  const usersService = {
    validateErpLogin: jest.fn(),
    findById: jest.fn(),
    findByIdForViewer: jest.fn(),
  };

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
      PassportModule.register({ defaultStrategy: 'jwt' }),
      JwtModule.register({
        secret: process.env.JWT_ACCESS_SECRET,
        signOptions: { expiresIn: '1h' },
      }),
      ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 10_000 }]),
    ],
    controllers: [AuthController],
    providers: [
      AuthService,
      JwtStrategy,
      { provide: UsersService, useValue: usersService },
      { provide: ErpSessionService, useValue: { endSession: jest.fn().mockResolvedValue(false) } },
      { provide: APP_GUARD, useClass: ThrottlerGuard },
    ],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.init();

  return app;
}

/** ERP-managed identity: bigint userId, username, role — no local email/password. */
export const TEST_USER = {
  userId: 3001n,
  id: '3001',
  username: 'hod-uat',
  role: UserRole.HOD,
};

export async function seedTestUser(usersService: UsersService) {
  (usersService.validateErpLogin as jest.Mock).mockImplementation(
    async (userName: string, password: string) =>
      userName === TEST_USER.username && password === 'password123'
        ? { userId: TEST_USER.userId, userName: TEST_USER.username, role: TEST_USER.role }
        : null,
  );
  (usersService.findById as jest.Mock).mockResolvedValue({
    id: TEST_USER.id,
    userName: TEST_USER.username,
    role: TEST_USER.role,
  });
}
