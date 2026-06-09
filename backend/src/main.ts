import { mkdirSync } from 'fs';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { SocketIoAdapter } from './common/adapters/socket-io.adapter';
import helmet from 'helmet';
import compression from 'compression';
import { Logger, ValidationPipe } from '@nestjs/common';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { ConfigService } from '@nestjs/config';
import { installBigIntJsonSerialization } from './common/utils/json-serialization.util';

installBigIntJsonSerialization();

async function bootstrap() {
  mkdirSync(join(process.cwd(), 'uploads', 'chatter'), { recursive: true });

  const app = await NestFactory.create(AppModule, new ExpressAdapter());
  app.useWebSocketAdapter(new SocketIoAdapter(app));
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
