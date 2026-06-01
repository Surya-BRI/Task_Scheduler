import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';

@UseGuards(JwtAuthGuard)
@Controller('conversations')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly chatGateway: ChatGateway,
  ) {}

  /**
   * Start a new conversation (or retrieve existing DM).
   */
  @Post()
  create(
    @CurrentUser() user: any,
    @Body() dto: CreateConversationDto,
  ) {
    const userId = user.sub || user.id;
    return this.chatService.createConversation(userId, dto);
  }

  /**
   * List all conversations for the current user.
   */
  @Get()
  findAll(@CurrentUser() user: any) {
    const userId = user.sub || user.id;
    return this.chatService.findAllConversations(userId);
  }

  /**
   * Fetch paginated message history for a conversation.
   */
  @Get(':id/messages')
  findMessages(
    @CurrentUser() user: any,
    @Param('id') conversationId: string,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ) {
    const userId = user.sub || user.id;
    const parsedLimit = limit ? Math.min(100, Math.max(1, parseInt(limit, 10))) : 50;
    return this.chatService.findMessages(userId, conversationId, parsedLimit, before);
  }

  /**
   * Send a message to a conversation.
   * Broadcasts the message in real-time to active WebSocket connections in the conversation.
   */
  @Post(':id/messages')
  async sendMessage(
    @CurrentUser() user: any,
    @Param('id') conversationId: string,
    @Body() dto: SendMessageDto,
  ) {
    const userId = user.sub || user.id;
    const message = await this.chatService.sendMessage(userId, conversationId, dto);

    // Broadcast the message in real-time to all sockets in the conversation room
    if (this.chatGateway.server) {
      this.chatGateway.server.to(`conv:${conversationId}`).emit('message', message);
    }

    return message;
  }

  /**
   * Mark all messages in a conversation as read.
   * Broadcasts a 'messageRead' event to active WebSocket connections.
   */
  @Post(':id/read')
  async markAsRead(
    @CurrentUser() user: any,
    @Param('id') conversationId: string,
  ) {
    const userId = user.sub || user.id;
    const result = await this.chatService.markAsRead(userId, conversationId);

    // Broadcast messageRead event to the conversation room
    if (this.chatGateway.server) {
      this.chatGateway.server.to(`conv:${conversationId}`).emit('messageRead', {
        conversationId,
        userId,
        readAt: result.readAt,
      });
    }

    return result;
  }

  /**
   * Delete a conversation / leave group.
   */
  @Delete(':id')
  delete(
    @CurrentUser() user: any,
    @Param('id') conversationId: string,
  ) {
    const userId = user.sub || user.id;
    return this.chatService.deleteConversation(userId, conversationId);
  }
}
