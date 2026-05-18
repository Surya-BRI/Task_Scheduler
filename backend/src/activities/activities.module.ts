import { Module } from '@nestjs/common';
import { ActivitiesController } from './activities.controller';
import { ActivitiesService } from './activities.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ActivityLoggerService } from './activity-logger.service';

@Module({
  imports: [PrismaModule],
  controllers: [ActivitiesController],
  providers: [ActivitiesService, ActivityLoggerService],
  exports: [ActivityLoggerService],
})
export class ActivitiesModule {}
