import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';
import { SendMessageDto } from './dto/send-message.dto';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer()
  server: Server;

  // Track active connections by mapping userId -> Array of Socket instances (supports multiple tabs!)
  private readonly activeConnections = new Map<string, Socket[]>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly chatService: ChatService,
  ) {}

  /**
   * Authenticats socket connection using JWT and registers presence.
   */
  async handleConnection(client: Socket) {
    try {
      let token = client.handshake.auth?.token || client.handshake.headers?.authorization;
      if (!token) {
        this.logger.warn(`Connection rejected: No token provided on socket ${client.id}`);
        client.disconnect();
        return;
      }

      // Remove Bearer prefix if present
      if (token.startsWith('Bearer ')) {
        token = token.slice(7);
      }

      const payload = await this.jwtService.verifyAsync(token);
      const userId = payload.sub || payload.id;
      if (!userId) {
        this.logger.warn(`Connection rejected: Invalid sub claim in JWT on socket ${client.id}`);
        client.disconnect();
        return;
      }

      // Store authenticated user in client data
      client.data.user = {
        id: userId,
        email: payload.email,
        role: payload.role,
      };

      // Register socket in active connections map
      const sockets = this.activeConnections.get(userId) || [];
      sockets.push(client);
      this.activeConnections.set(userId, sockets);

      this.logger.log(`User ${userId} authenticated and connected on socket ${client.id}`);

      // Auto-join user to their individual room (useful for direct system notifications)
      await client.join(`user:${userId}`);

      // Join the rooms of all active conversations the user is part of
      const conversations = await this.chatService.findAllConversations(userId);
      for (const conv of conversations) {
        await client.join(`conv:${conv.id}`);
      }

      // Broadcast user online status to all participants in their conversations
      await this.broadcastPresence(userId, 'online', conversations);
    } catch (err) {
      this.logger.error(`WebSocket connection authentication error: ${err.message}`);
      client.disconnect();
    }
  }

  /**
   * Cleans up socket connection on disconnect and broadcasts offline status.
   */
  async handleDisconnect(client: Socket) {
    const user = client.data.user;
    if (!user) return;

    const userId = user.id;
    const sockets = this.activeConnections.get(userId) || [];
    const updatedSockets = sockets.filter((s) => s.id !== client.id);

    if (updatedSockets.length > 0) {
      this.activeConnections.set(userId, updatedSockets);
      this.logger.log(`Socket ${client.id} disconnected for user ${userId} (tabs remaining: ${updatedSockets.length})`);
    } else {
      this.activeConnections.delete(userId);
      this.logger.log(`User ${userId} disconnected all sockets`);

      // User went offline, broadcast offline status to all of their conversation rooms
      try {
        const conversations = await this.chatService.findAllConversations(userId);
        await this.broadcastPresence(userId, 'offline', conversations);
      } catch (err) {
        this.logger.error(`Failed to broadcast offline presence for user ${userId}: ${err.message}`);
      }
    }
  }

  /**
   * Event: join/subscribe to conversation rooms.
   */
  @SubscribeMessage('subscribe')
  async handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const user = client.data.user;
    if (!user) return { error: 'Unauthorized' };

    try {
      await this.chatService.validateParticipation(user.id, data.conversationId);
      await client.join(`conv:${data.conversationId}`);
      this.logger.log(`Socket ${client.id} subscribed to room conv:${data.conversationId}`);
      return { success: true, joined: data.conversationId };
    } catch (err) {
      this.logger.warn(`Subscribe rejected for user ${user.id} on room ${data.conversationId}: ${err.message}`);
      return { error: err.message };
    }
  }

  /**
   * Event: Typing indicator broadcast.
   */
  @SubscribeMessage('typing')
  async handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string; isTyping: boolean },
  ) {
    const user = client.data.user;
    if (!user) return;

    try {
      await this.chatService.validateParticipation(user.id, data.conversationId);
      
      // Broadcast to all clients in the conversation except the sender
      client.to(`conv:${data.conversationId}`).emit('typingStatus', {
        conversationId: data.conversationId,
        userId: user.id,
        isTyping: data.isTyping,
      });
    } catch {
      // Fail silently to keep gateway robust
    }
  }

  /**
   * Event: Send message over WebSockets.
   */
  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string; content: string },
  ) {
    const user = client.data.user;
    if (!user) return { error: 'Unauthorized' };

    try {
      if (!data.content?.trim()) {
        return { error: 'Message content cannot be empty' };
      }

      // Save message in database
      const dto = new SendMessageDto();
      dto.content = data.content.trim();
      const savedMessage = await this.chatService.sendMessage(user.id, data.conversationId, dto);

      // Emit new message event to all sockets in the conversation room
      this.server.to(`conv:${data.conversationId}`).emit('message', savedMessage);

      return { success: true, messageId: savedMessage.id };
    } catch (err) {
      this.logger.error(`Failed to send WebSocket message: ${err.message}`);
      return { error: err.message };
    }
  }

  /**
   * Event: Client checks the online/offline status of a user.
   */
  @SubscribeMessage('presence')
  handlePresenceQuery(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string },
  ) {
    const isOnline = this.activeConnections.has(data.userId);
    return { userId: data.userId, status: isOnline ? 'online' : 'offline' };
  }

  /**
   * Helper to broadcast a user's presence status (online/offline) to all active conversations.
   */
  private async broadcastPresence(userId: string, status: 'online' | 'offline', conversations: any[]) {
    for (const conv of conversations) {
      this.server.to(`conv:${conv.id}`).emit('presenceStatus', {
        userId,
        status,
      });
    }
  }
}
