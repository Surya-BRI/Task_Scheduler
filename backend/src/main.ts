import { mkdirSync } from 'fs';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { SocketIoAdapter } from './common/adapters/socket-io.adapter';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { Logger, ValidationPipe } from '@nestjs/common';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { BigIntSerializationInterceptor } from './common/interceptors/bigint-serialization.interceptor';
import { ConfigService } from '@nestjs/config';
import { installBigIntJsonSerialization } from './common/utils/json-serialization.util';
import { resolveCorsOrigins } from './common/utils/resolve-cors-origins.util';
import { requestTimeoutMiddleware } from './common/middleware/request-timeout.middleware';

installBigIntJsonSerialization();

async function bootstrap() {
  mkdirSync(join(process.cwd(), 'uploads', 'chatter'), { recursive: true });

  const app = await NestFactory.create(AppModule, new ExpressAdapter());
  app.enableShutdownHooks();
  app.useWebSocketAdapter(new SocketIoAdapter(app));
  const configService = app.get(ConfigService);
  const prefix = configService.get<string>('api.prefix') ?? 'api/v1';
  const port = configService.get<number>('app.port') ?? 4000;
  const corsOrigin = configService.get<string>('app.corsOrigin') ?? 'http://localhost:5000';
  const nodeEnv = configService.get<string>('app.nodeEnv') ?? process.env.NODE_ENV;
  const requestTimeoutMs = Number(process.env.HTTP_REQUEST_TIMEOUT_MS ?? 30_000);
  const shutdownTimeoutMs = Number(process.env.SHUTDOWN_TIMEOUT_MS ?? 15_000);

  app.setGlobalPrefix(prefix);
  app.use(cookieParser());
  app.use(requestTimeoutMiddleware(requestTimeoutMs));
  app.use(helmet());
  app.use(compression());
  app.enableCors({
    origin: resolveCorsOrigins(corsOrigin, nodeEnv),
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
  app.useGlobalInterceptors(
    new BigIntSerializationInterceptor(),
    new LoggingInterceptor(),
  );

  await app.listen(port);

  const baseUrl = `http://localhost:${port}/${prefix}`;
  const logger = new Logger('Bootstrap');
  logger.log(`API ready at ${baseUrl}`);
  logger.log(`Liveness: ${baseUrl}/health`);
  logger.log(`Readiness: ${baseUrl}/health/ready`);

  const gracefulShutdown = async (signal: string) => {
    logger.log(`Received ${signal}, shutting down gracefully...`);
    const forceTimer = setTimeout(() => {
      logger.error(`Forced shutdown after ${shutdownTimeoutMs}ms`);
      process.exit(1);
    }, shutdownTimeoutMs);

    try {
      await app.close();
      clearTimeout(forceTimer);
      logger.log('Shutdown complete');
      process.exit(0);
    } catch (err) {
      clearTimeout(forceTimer);
      logger.error('Error during shutdown', err instanceof Error ? err.stack : String(err));
      process.exit(1);
    }
  };

  process.once('SIGTERM', () => void gracefulShutdown('SIGTERM'));
  process.once('SIGINT', () => void gracefulShutdown('SIGINT'));
}
bootstrap();
