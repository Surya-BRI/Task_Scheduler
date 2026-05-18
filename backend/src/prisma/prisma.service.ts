import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  readonly live: PrismaClient;

  constructor(configService: ConfigService) {
    // Use the primary application database URL for Prisma models/migrations.
    const databaseUrl = configService.get<string>('database.url') ?? process.env.DATABASE_URL;
    const liveDatabaseUrl = process.env.LIVE_DATABASE_URL;

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

    this.live = new PrismaClient(
      liveDatabaseUrl
        ? {
            datasources: {
              db: {
                url: liveDatabaseUrl,
              },
            },
          }
        : undefined,
    );
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    await this.live.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.live.$disconnect();
    await this.$disconnect();
  }
}
