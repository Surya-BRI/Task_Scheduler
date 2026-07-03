import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import * as bcrypt from 'bcrypt';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { UsersService } from '../src/users/users.service';
import { ConfigModule } from '@nestjs/config';
import configuration from '../src/config/configuration';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

/** Minimal Nest app for Supertest integration tests (no database). */
export async function createIntegrationApp(): Promise<INestApplication> {
  process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'integration-test-jwt-secret';
  process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
  process.env.CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:5000';

  const usersService = {
    create: jest.fn(),
    findByEmail: jest.fn(),
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

export const TEST_USER = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  email: 'hod@example.com',
  fullName: 'Test HOD',
  passwordHash: '',
  role: { name: 'HOD' },
};

export async function seedTestUser(usersService: UsersService) {
  TEST_USER.passwordHash = await bcrypt.hash('password123', 4);
  (usersService.findByEmail as jest.Mock).mockImplementation(async (email: string) =>
    email === TEST_USER.email ? TEST_USER : null,
  );
  (usersService.findById as jest.Mock).mockResolvedValue({
    id: TEST_USER.id,
    email: TEST_USER.email,
    fullName: TEST_USER.fullName,
    role: TEST_USER.role,
  });
}
