import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ErpSessionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Mirrors the ERP's own logout (auth_logout/:session_id): marks the ErpAuthSession row logged
   * out and nulls the user's fcmToken. loggedOut is written in UAE local time (UTC+4, no DST)
   * because that's what the ERP itself stores in loggedOn/loggedOut — the DB clock is UTC.
   *
   * Scoped to the caller's own userId, and a no-op when the session is already logged out
   * (fcmToken left untouched, same as the ERP). Returns whether a session was actually ended.
   */
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
