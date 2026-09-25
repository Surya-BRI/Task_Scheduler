import { ForbiddenException, Injectable, Logger, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { DashboardRealtimeService } from '../dashboard/dashboard-realtime.service';
import { parseMentionUserIdsFromMessage, messageSnippet } from '../chatter-posts/chatter-mentions.util';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly dashboardRealtime?: DashboardRealtimeService,
  ) {}

  /**
   * Helper to verify if a user is a participant in a conversation.
   */
  async validateParticipation(userId: string, conversationId: string) {
    const participant = await this.prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId: BigInt(userId),
        },
      },
    });
    if (!participant) {
      throw new ForbiddenException('You are not a participant in this conversation');
    }
    return participant;
  }

  /**
   * Creates a new conversation (or retrieves an existing DM).
   */
  async createConversation(creatorId: string, dto: CreateConversationDto) {
    const isGroup = dto.isGroup ?? false;
    const rawParticipantIds = dto.participantIds || [];

    // Ensure all participant IDs are unique and filter out empty strings
    const uniqueIds = Array.from(new Set(rawParticipantIds.map((id) => id.trim()).filter(Boolean)));

    // Include the creator in the participant list
    if (!uniqueIds.includes(creatorId)) {
      uniqueIds.push(creatorId);
    }

    if (uniqueIds.length < 2) {
      throw new BadRequestException('Conversations must have at least 2 participants');
    }

    // Check if a direct message conversation already exists between the same 2 participants
    if (!isGroup && uniqueIds.length === 2) {
      const existingDM = await this.prisma.conversation.findFirst({
        where: {
          isGroup: false,
          AND: uniqueIds.map((userId) => ({
            participants: {
              some: { userId: BigInt(userId) },
            },
          })),
        },
        include: {
          participants: {
            include: {
              user: {
                select: {
                  userId: true,
                  userName: true,
                },
              },
            },
          },
        },
      });

      if (existingDM) {
        return existingDM;
      }
    }

    // Create the conversation in a transaction
    return this.prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.create({
        data: {
          name: isGroup ? (dto.name?.trim() || 'Group Chat') : null,
          isGroup,
          participants: {
            create: uniqueIds.map((userId) => ({
              userId: BigInt(userId),
            })),
          },
        },
        include: {
          participants: {
            include: {
              user: {
                select: {
                  userId: true,
                  userName: true,
                },
              },
            },
          },
        },
      });

      return conversation;
    }, { timeout: 15_000 });
  }

  /**
   * Retrieves all conversations for a user, with last message, participant details, and unread counts.
   */
  async findAllConversations(userId: string) {
    // Find all participant records for this user
    const userParticipations = await this.prisma.conversationParticipant.findMany({
      where: { userId: BigInt(userId) },
      select: { conversationId: true },
    });

    const conversationIds = userParticipations.map((p) => p.conversationId);
    if (conversationIds.length === 0) return [];

    const conversations = await this.prisma.conversation.findMany({
      where: {
        id: { in: conversationIds },
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                userId: true,
                userName: true,
              },
            },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            sender: {
              select: {
                userId: true,
                userName: true,
              },
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Compute unread message counts in parallel for all conversations
    const results = await Promise.all(
      conversations.map(async (conv) => {
        const myParticipantRecord = conv.participants.find((p) => p.userId === BigInt(userId));
        const lastReadAt = myParticipantRecord?.lastReadAt || new Date(0);

        const unreadCount = await this.prisma.message.count({
          where: {
            conversationId: conv.id,
            senderId: { not: BigInt(userId) },
            createdAt: { gt: lastReadAt },
          },
        });

        return {
          ...conv,
          lastMessage: conv.messages[0] || null,
          unreadCount,
          // Exclude the redundant full messages array
          messages: undefined,
        };
      }),
    );

    return results;
  }

  /**
   * Retrieves paginated messages for a conversation.
   */
  async findMessages(userId: string, conversationId: string, limit: number = 50, before?: string) {
    await this.validateParticipation(userId, conversationId);

    const whereClause: any = { conversationId };
    if (before) {
      const beforeDate = new Date(before);
      if (!isNaN(beforeDate.getTime())) {
        whereClause.createdAt = { lt: beforeDate };
      }
    }

    const messages = await this.prisma.message.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        sender: {
          select: {
            userId: true,
            userName: true,
          },
        },
      },
    });

    // Return messages in chronological order (oldest first)
    return messages.reverse();
  }

  /**
   * Saves a message to a conversation.
   */
  async sendMessage(userId: string, conversationId: string, dto: SendMessageDto) {
    await this.validateParticipation(userId, conversationId);

    const message = await this.prisma.$transaction(async (tx) => {
      const msg = await tx.message.create({
        data: {
          conversationId,
          senderId: BigInt(userId),
          content: dto.content,
        },
        include: {
          sender: {
            select: {
              userId: true,
              userName: true,
            },
          },
        },
      });

      // Update conversation updatedAt so it floats to the top of lists
      await tx.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });

      return msg;
    }, { timeout: 15_000 });

    this.notifyOtherParticipants(conversationId, message).catch((err) =>
      this.logger.error('Failed to notify conversation participants of new message', err),
    );

    return message;
  }

  private async notifyOtherParticipants(
    conversationId: string,
    message: { id: string; senderId: bigint; content: string; sender: { userName: string } },
  ): Promise<void> {
    const participants = await this.prisma.conversationParticipant.findMany({
      where: { conversationId, userId: { not: message.senderId } },
      select: { userId: true, user: { select: { userId: true, userName: true } } },
    });
    if (participants.length === 0) return;

    const directory = participants.map((p) => ({ id: String(p.userId), fullName: p.user.userName ?? '' }));
    const mentionedIds = new Set(parseMentionUserIdsFromMessage(message.content, directory));
    const snippet = messageSnippet(message.content);
    const linkUrl = `/chat?conversationId=${conversationId}`;

    for (const participant of participants) {
      const isMentioned = mentionedIds.has(String(participant.userId));
      const title = isMentioned ? 'You were mentioned in a chat message' : 'New Message';
      const body = isMentioned
        ? `${message.sender.userName} mentioned you: "${snippet}"`
        : `${message.sender.userName}: ${snippet}`;
      try {
        await this.prisma.notification.create({
          data: { id: randomUUID(), userId: participant.userId, title, message: body, linkUrl },
        });
        this.dashboardRealtime?.notifyUserNotificationRefresh(String(participant.userId));
      } catch (err) {
        this.logger.warn(`Chat message notification failed for ${participant.userId}: ${err}`);
      }
    }
  }

  /**
   * Updates the read receipt timestamp for a user in a conversation.
   */
  async markAsRead(userId: string, conversationId: string) {
    const participant = await this.validateParticipation(userId, conversationId);

    const now = new Date();
    await this.prisma.conversationParticipant.update({
      where: { id: participant.id },
      data: { lastReadAt: now },
    });

    return { success: true, readAt: now };
  }

  /**
   * Deletes a conversation for everyone (or leaves if group).
   */
  async deleteConversation(userId: string, conversationId: string) {
    const participant = await this.validateParticipation(userId, conversationId);
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { _count: { select: { participants: true } } },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (conversation.isGroup && conversation._count.participants > 1) {
      // Leave group
      await this.prisma.conversationParticipant.delete({
        where: { id: participant.id },
      });
      return { message: 'Left the group successfully' };
    } else {
      // Delete conversation entirely (will cascade delete messages and participants)
      await this.prisma.conversation.delete({
        where: { id: conversationId },
      });
      return { message: 'Conversation deleted successfully' };
    }
  }
}
