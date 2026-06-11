import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UserRole } from '../common/constants/roles.enum';
import {
  ChatterRefreshPayload,
  DashboardRealtimeService,
  DashboardRefreshPayload,
} from './dashboard-realtime.service';

const OVERVIEW_ROLES = new Set<string>([UserRole.HOD]);

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/dashboard',
})
export class DashboardGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(DashboardGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly dashboardRealtime: DashboardRealtimeService,
  ) {}

  afterInit() {
    this.dashboardRealtime.registerEmitter({
      emitDashboardRefresh: (payload) => this.broadcastOverviewRefresh(payload),
      emitNotificationRefresh: (userId) => this.emitNotificationRefresh(userId),
      emitChatterRefresh: (payload) => this.broadcastChatterRefresh(payload),
    });
    this.logger.log('Dashboard realtime gateway initialized');
  }

  async handleConnection(client: Socket) {
    try {
      let token = client.handshake.auth?.token || client.handshake.headers?.authorization;
      if (!token) {
        client.disconnect();
        return;
      }
      if (typeof token === 'string' && token.startsWith('Bearer ')) {
        token = token.slice(7);
      }

      const payload = await this.jwtService.verifyAsync(token);
      const userId = payload.sub || payload.id;
      const role = payload.role as string;
      if (!userId) {
        client.disconnect();
        return;
      }

      client.data.user = { id: userId, role };
      await client.join(`user:${userId}`);
      await client.join('chatter');
      if (role && OVERVIEW_ROLES.has(role)) {
        await client.join(`role:${role}`);
        await client.join('overview');
      }
    } catch (err) {
      this.logger.warn(`Dashboard socket auth failed: ${(err as Error).message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Dashboard socket disconnected: ${client.id}`);
  }

  private broadcastOverviewRefresh(payload: DashboardRefreshPayload) {
    this.server?.to('overview').emit('dashboard:refresh', payload);
  }

  private emitNotificationRefresh(userId: string) {
    this.server?.to(`user:${userId}`).emit('notifications:refresh', {
      at: new Date().toISOString(),
    });
  }

  private broadcastChatterRefresh(payload: ChatterRefreshPayload) {
    this.server?.to('chatter').emit('chatter:refresh', payload);
  }
}
