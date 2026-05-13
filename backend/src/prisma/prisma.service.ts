import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    super(
      process.env.LIVE_DATABASE_URL
        ? {
            datasources: {
              db: {
                url: process.env.LIVE_DATABASE_URL,
              },
            },
          }
        : undefined,
    );
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }
}
