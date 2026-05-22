import { mkdirSync } from 'fs';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import helmet from 'helmet';
import compression from 'compression';
import { Logger, ValidationPipe } from '@nestjs/common';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { ConfigService } from '@nestjs/config';

// Prisma validates DATABASE_URL from schema.prisma at engine startup before
// NestJS config is available, so we build it from individual DB_* vars here.
function buildSqlServerUrl(
  server: string | undefined,
  port: string,
  database: string | undefined,
  user: string | undefined,
  password: string | undefined,
  encrypt: string,
  trust: string,
): string | undefined {
  if (!server || !database || !user || !password) return undefined;
  const encodedPassword = encodeURIComponent(password);
  const encodedUser = encodeURIComponent(user);
  return `sqlserver://${server}:${port};database=${database};user=${encodedUser};password=${encodedPassword};encrypt=${encrypt};trustServerCertificate=${trust}`;
}

if (!process.env.DATABASE_URL) {
  const url = buildSqlServerUrl(
    process.env.DB_SERVER,
    process.env.DB_PORT ?? '1433',
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    process.env.DB_ENCRYPT ?? 'true',
    process.env.DB_TRUST_SERVER_CERTIFICATE ?? 'true',
  );
  if (url) process.env.DATABASE_URL = url;
}

if (!process.env.LIVE_DATABASE_URL) {
  const url = buildSqlServerUrl(
    process.env.LIVE_DB_SERVER,
    process.env.LIVE_DB_PORT ?? '1433',
    process.env.LIVE_DB_NAME,
    process.env.LIVE_DB_USER,
    process.env.LIVE_DB_PASSWORD,
    process.env.LIVE_DB_ENCRYPT ?? 'true',
    process.env.LIVE_DB_TRUST_SERVER_CERTIFICATE ?? 'true',
  );
  if (url) process.env.LIVE_DATABASE_URL = url;
}

async function bootstrap() {
  mkdirSync(join(process.cwd(), 'uploads', 'chatter'), { recursive: true });

  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const prefix = configService.get<string>('api.prefix') ?? 'api/v1';
  const port = configService.get<number>('app.port') ?? 4000;
  const corsOrigin = configService.get<string>('app.corsOrigin') ?? 'http://localhost:5000';
  const allowedOrigins = corsOrigin.split(',').map((origin) => origin.trim());

  app.setGlobalPrefix(prefix);
  app.use(helmet());
  app.use(compression());
  const isDev = configService.get<string>('app.nodeEnv') !== 'production';
  const corsOriginFn = (_o: string | undefined, cb: (e: Error | null, ok?: boolean) => void): void => cb(null, true);
  app.enableCors({
    origin: isDev ? corsOriginFn : allowedOrigins,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  await app.listen(port);

  const baseUrl = `http://localhost:${port}/${prefix}`;
  const logger = new Logger('Bootstrap');
  logger.log(`API ready at ${baseUrl}`);
  logger.log(`Health check: ${baseUrl}/health`);
}
bootstrap();
