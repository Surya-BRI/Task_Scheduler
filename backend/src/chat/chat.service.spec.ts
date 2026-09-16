import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { ChatService } from './chat.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { DashboardRealtimeService } from '../dashboard/dashboard-realtime.service';


describe('ChatService', () => {
  let service: ChatService;

  const mockPrismaService: any = {
    conversationParticipant: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    conversation: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    message: {
      findMany: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
    },
    notification: {
      create: jest.fn(),
    },
    $transaction: jest.fn((cb: (tx: any) => any) => cb(mockPrismaService)),
  };

  const mockDashboardRealtime: any = { notifyUserNotificationRefresh: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: DashboardRealtimeService,
          useValue: mockDashboardRealtime,
        },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);

    jest.clearAllMocks();
    mockPrismaService.conversation.update.mockResolvedValue({});
    mockPrismaService.notification.create.mockResolvedValue({});
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateParticipation', () => {
    it('should return participant record if user is in conversation', async () => {
      const mockParticipant = { id: 'p1', userId: '6001', conversationId: 'c1' };
      mockPrismaService.conversationParticipant.findUnique.mockResolvedValue(mockParticipant);

      const result = await service.validateParticipation('6001', 'c1');
      expect(result).toEqual(mockParticipant);
      expect(mockPrismaService.conversationParticipant.findUnique).toHaveBeenCalledWith({
        where: {
          conversationId_userId: {
            conversationId: 'c1',
            userId: BigInt('6001'),
          },
        },
      });
    });

    it('should throw ForbiddenException if user is not in conversation', async () => {
      mockPrismaService.conversationParticipant.findUnique.mockResolvedValue(null);

      await expect(service.validateParticipation('6001', 'c1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('createConversation', () => {
    it('should throw BadRequestException if less than 2 participants', async () => {
      const dto: CreateConversationDto = {
        participantIds: [],
        isGroup: false,
      };

      await expect(service.createConversation('6001', dto)).rejects.toThrow(BadRequestException);
    });

    it('should reuse existing DM if it already exists between 2 participants', async () => {
      const dto: CreateConversationDto = {
        participantIds: ['6002'],
        isGroup: false,
      };

      const mockExistingDM = {
        id: 'c1',
        isGroup: false,
        participants: [
          { userId: '6001', user: { userId: '6001', userName: 'User 1' } },
          { userId: '6002', user: { userId: '6002', userName: 'User 2' } },
        ],
      };

      mockPrismaService.conversation.findFirst.mockResolvedValue(mockExistingDM);

      const result = await service.createConversation('6001', dto);
      expect(result).toEqual(mockExistingDM);
      expect(mockPrismaService.conversation.findFirst).toHaveBeenCalled();
      expect(mockPrismaService.conversation.create).not.toHaveBeenCalled();
    });
  });

  describe('findMessages', () => {
    it('should validate participation and return messages in chronological order', async () => {
      const mockParticipant = { id: 'p1', userId: '6001', conversationId: 'c1' };
      mockPrismaService.conversationParticipant.findUnique.mockResolvedValue(mockParticipant);

      const mockMessages = [
        { id: 'm2', content: 'Second message', createdAt: new Date('2026-05-26T12:00:00Z') },
        { id: 'm1', content: 'First message', createdAt: new Date('2026-05-26T11:00:00Z') },
      ];
      mockPrismaService.message.findMany.mockResolvedValue(mockMessages);

      const result = await service.findMessages('6001', 'c1', 10);
      
      // Chronological order: oldest first (m1 first, then m2)
      expect(result[0].id).toBe('m1');
      expect(result[1].id).toBe('m2');
      expect(mockPrismaService.conversationParticipant.findUnique).toHaveBeenCalled();
      expect(mockPrismaService.message.findMany).toHaveBeenCalled();
    });
  });

  describe('markAsRead', () => {
    it('should update lastReadAt date for the participant', async () => {
      const mockParticipant = { id: 'p1', userId: '6001', conversationId: 'c1' };
      mockPrismaService.conversationParticipant.findUnique.mockResolvedValue(mockParticipant);
      mockPrismaService.conversationParticipant.update.mockResolvedValue({ id: 'p1', lastReadAt: new Date() });

      const result = await service.markAsRead('6001', 'c1');
      expect(result.success).toBe(true);
      expect(mockPrismaService.conversationParticipant.update).toHaveBeenCalled();
    });
  });

  describe('sendMessage — notification parity with Chatter', () => {
    const flush = () => new Promise((resolve) => setImmediate(resolve));

    beforeEach(() => {
      mockPrismaService.conversationParticipant.findUnique.mockResolvedValue({
        id: 'p1',
        userId: '6001',
        conversationId: 'c1',
      });
      mockPrismaService.message.create.mockResolvedValue({
        id: 'm1',
        senderId: '6001',
        content: 'hello there',
        sender: { userId: '6001', userName: 'Alex Sender' },
      });
    });

    it('notifies other participants of a plain message with a generic title', async () => {
      mockPrismaService.conversationParticipant.findMany.mockResolvedValue([
        { userId: '6002', user: { userId: '6002', userName: 'Ben Receiver' } },
      ]);

      await service.sendMessage('6001', 'c1', { content: 'hello there' } as any);
      await flush();

      expect(mockPrismaService.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: '6002', title: 'New Message' }),
        }),
      );
      expect(mockDashboardRealtime.notifyUserNotificationRefresh).toHaveBeenCalledWith('6002');
    });

    it('does not notify the sender themselves', async () => {
      mockPrismaService.conversationParticipant.findMany.mockResolvedValue([
        { userId: '6002', user: { userId: '6002', userName: 'Ben Receiver' } },
      ]);

      await service.sendMessage('6001', 'c1', { content: 'hello there' } as any);
      await flush();

      expect(mockPrismaService.conversationParticipant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId: { not: '6001' } }) }),
      );
    });

    it('sends a distinct "mentioned" notification to a participant named in the message', async () => {
      mockPrismaService.message.create.mockResolvedValue({
        id: 'm2',
        senderId: '6001',
        content: '@Ben Receiver can you check this?',
        sender: { userId: '6001', userName: 'Alex Sender' },
      });
      mockPrismaService.conversationParticipant.findMany.mockResolvedValue([
        { userId: '6002', user: { userId: '6002', userName: 'Ben Receiver' } },
        { userId: '6003', user: { userId: '6003', userName: 'Casey Other' } },
      ]);

      await service.sendMessage('6001', 'c1', { content: '@Ben Receiver can you check this?' } as any);
      await flush();

      expect(mockPrismaService.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: '6002', title: 'You were mentioned in a chat message' }),
        }),
      );
      expect(mockPrismaService.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: '6003', title: 'New Message' }),
        }),
      );
    });
  });
});
