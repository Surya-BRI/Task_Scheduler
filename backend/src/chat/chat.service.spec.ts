import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { ChatService } from './chat.service';
import { CreateConversationDto } from './dto/create-conversation.dto';


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
      delete: jest.fn(),
    },
    message: {
      findMany: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn((cb: (tx: any) => any) => cb(mockPrismaService)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateParticipation', () => {
    it('should return participant record if user is in conversation', async () => {
      const mockParticipant = { id: 'p1', userId: 'u1', conversationId: 'c1' };
      mockPrismaService.conversationParticipant.findUnique.mockResolvedValue(mockParticipant);

      const result = await service.validateParticipation('u1', 'c1');
      expect(result).toEqual(mockParticipant);
      expect(mockPrismaService.conversationParticipant.findUnique).toHaveBeenCalledWith({
        where: {
          conversationId_userId: {
            conversationId: 'c1',
            userId: 'u1',
          },
        },
      });
    });

    it('should throw ForbiddenException if user is not in conversation', async () => {
      mockPrismaService.conversationParticipant.findUnique.mockResolvedValue(null);

      await expect(service.validateParticipation('u1', 'c1')).rejects.toThrow(
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

      await expect(service.createConversation('u1', dto)).rejects.toThrow(BadRequestException);
    });

    it('should reuse existing DM if it already exists between 2 participants', async () => {
      const dto: CreateConversationDto = {
        participantIds: ['u2'],
        isGroup: false,
      };

      const mockExistingDM = {
        id: 'c1',
        isGroup: false,
        participants: [
          { userId: 'u1', user: { id: 'u1', fullName: 'User 1' } },
          { userId: 'u2', user: { id: 'u2', fullName: 'User 2' } },
        ],
      };

      mockPrismaService.conversation.findFirst.mockResolvedValue(mockExistingDM);

      const result = await service.createConversation('u1', dto);
      expect(result).toEqual(mockExistingDM);
      expect(mockPrismaService.conversation.findFirst).toHaveBeenCalled();
      expect(mockPrismaService.conversation.create).not.toHaveBeenCalled();
    });
  });

  describe('findMessages', () => {
    it('should validate participation and return messages in chronological order', async () => {
      const mockParticipant = { id: 'p1', userId: 'u1', conversationId: 'c1' };
      mockPrismaService.conversationParticipant.findUnique.mockResolvedValue(mockParticipant);

      const mockMessages = [
        { id: 'm2', content: 'Second message', createdAt: new Date('2026-05-26T12:00:00Z') },
        { id: 'm1', content: 'First message', createdAt: new Date('2026-05-26T11:00:00Z') },
      ];
      mockPrismaService.message.findMany.mockResolvedValue(mockMessages);

      const result = await service.findMessages('u1', 'c1', 10);
      
      // Chronological order: oldest first (m1 first, then m2)
      expect(result[0].id).toBe('m1');
      expect(result[1].id).toBe('m2');
      expect(mockPrismaService.conversationParticipant.findUnique).toHaveBeenCalled();
      expect(mockPrismaService.message.findMany).toHaveBeenCalled();
    });
  });

  describe('markAsRead', () => {
    it('should update lastReadAt date for the participant', async () => {
      const mockParticipant = { id: 'p1', userId: 'u1', conversationId: 'c1' };
      mockPrismaService.conversationParticipant.findUnique.mockResolvedValue(mockParticipant);
      mockPrismaService.conversationParticipant.update.mockResolvedValue({ id: 'p1', lastReadAt: new Date() });

      const result = await service.markAsRead('u1', 'c1');
      expect(result.success).toBe(true);
      expect(mockPrismaService.conversationParticipant.update).toHaveBeenCalled();
    });
  });
});
