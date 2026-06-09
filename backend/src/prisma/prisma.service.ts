import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { withPrismaConnectionPool } from './prisma-pool.util';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private liveClient: PrismaClient;
  private liveIsDedicated: boolean;

  /** ERP / reporting reads (`ErpMaster*` tables). Shares the app pool when URLs match. */
  get live(): PrismaClient {
    return this.liveClient;
  }

  constructor(configService: ConfigService) {
    const databaseUrl = withPrismaConnectionPool(
      configService.get<string>('database.url') ?? process.env.DATABASE_URL,
    );
    const liveDatabaseUrl = withPrismaConnectionPool(process.env.LIVE_DATABASE_URL?.trim());

    super(
      databaseUrl
        ? {
            datasources: {
              db: {
                url: databaseUrl,
              },
            },
          }
        : undefined,
    );

    const sharePrimaryPool =
      !liveDatabaseUrl || !databaseUrl || liveDatabaseUrl === databaseUrl;

    if (sharePrimaryPool) {
      this.liveClient = this;
      this.liveIsDedicated = false;
    } else {
      this.liveClient = new PrismaClient({
        datasources: {
          db: {
            url: liveDatabaseUrl,
          },
        },
      });
      this.liveIsDedicated = true;
    }
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    if (!this.liveIsDedicated) return;

    try {
      await this.liveClient.$connect();
    } catch (err) {
      console.warn(
        '[PrismaService] Dedicated live DB unavailable — ERP master queries will use the primary database pool:',
        (err as Error).message,
      );
      this.liveClient = this;
      this.liveIsDedicated = false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.liveIsDedicated) {
      await this.liveClient.$disconnect();
    }
    await this.$disconnect();
  }
}
