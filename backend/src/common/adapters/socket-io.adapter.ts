import { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';

/**
 * Binds Socket.IO to the Nest HTTP server.
 * Passes the underlying http.Server directly so adapter setup works in npm
 * workspaces where duplicate @nestjs/core copies break `instanceof NestApplication`.
 */
export class SocketIoAdapter extends IoAdapter {
  constructor(app: INestApplication) {
    super(app.getHttpServer());
  }

  createIOServer(port: number, options?: ServerOptions) {
    return super.createIOServer(port, {
      ...options,
      cors: { origin: true, credentials: true },
    });
  }
}
