import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { resolveCorsOrigins } from '../utils/resolve-cors-origins.util';

/**
 * Binds Socket.IO to the Nest HTTP server with CORS aligned to HTTP settings.
 */
export class SocketIoAdapter extends IoAdapter {
  private readonly corsOrigin: string[] | boolean;

  constructor(app: INestApplication) {
    super(app.getHttpServer());
    const configService = app.get(ConfigService);
    const corsOriginConfig = configService.get<string>('app.corsOrigin');
    const nodeEnv = configService.get<string>('app.nodeEnv') ?? process.env.NODE_ENV;
    this.corsOrigin = resolveCorsOrigins(corsOriginConfig, nodeEnv);
  }

  createIOServer(port: number, options?: ServerOptions) {
    return super.createIOServer(port, {
      ...options,
      // Avoid `/socket.io/` vs `/socket.io` trailing-slash mismatches with proxies (BUG-008).
      addTrailingSlash: false,
      cors: { origin: this.corsOrigin, credentials: true },
    });
  }
}
