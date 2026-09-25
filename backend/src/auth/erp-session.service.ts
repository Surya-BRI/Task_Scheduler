import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ErpSessionService {
  constructor(private readonly prisma: PrismaService) {}

  async endSession(sessionId: bigint, userId: bigint): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const ended = await tx.$executeRaw`
        UPDATE ErpAuthSession
        SET isLoggedOut = 1, loggedOut = DATEADD(HOUR, 4, GETUTCDATE())
        WHERE sessionId = ${sessionId} AND userId = ${userId} AND isLoggedOut = 0
      `;
      if (ended === 0) return false;
      await tx.$executeRaw`UPDATE ErpAuthUsers SET fcmToken = NULL WHERE userId = ${userId}`;
      return true;
    });
  }
}
