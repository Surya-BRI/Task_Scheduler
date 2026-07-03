import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { CronLockService } from '../common/services/cron-lock.service';

@Module({
  providers: [PrismaService, CronLockService],
  exports: [PrismaService, CronLockService],
})
export class PrismaModule {}
