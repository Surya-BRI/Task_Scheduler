import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import helmet from 'helmet';
import compression from 'compression';
import { ValidationPipe } from '@nestjs/common';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const prefix = configService.get<string>('api.prefix') ?? 'api/v1';
  const port = configService.get<number>('app.port') ?? 4000;
  const corsOrigin = configService.get<string>('app.corsOrigin') ?? 'http://localhost:5000';
  const allowedOrigins = corsOrigin.split(',').map((origin) => origin.trim());

  app.setGlobalPrefix(prefix);
  app.use(helmet());
  app.use(compression());
  app.enableCors({
    origin: allowedOrigins,
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
}
bootstrap();
