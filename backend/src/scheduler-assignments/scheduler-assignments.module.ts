import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ActivitiesModule } from '../activities/activities.module';
import { SchedulerAssignmentsController } from './scheduler-assignments.controller';
import { SchedulerAssignmentsService } from './scheduler-assignments.service';

@Module({
  imports: [PrismaModule, ActivitiesModule],
  controllers: [SchedulerAssignmentsController],
  providers: [SchedulerAssignmentsService],
})
export class SchedulerAssignmentsModule {}
