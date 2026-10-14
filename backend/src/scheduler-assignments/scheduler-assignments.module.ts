import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ActivitiesModule } from '../activities/activities.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { GraphMailModule } from '../graph-mail/graph-mail.module';
import { SchedulerAssignmentsController } from './scheduler-assignments.controller';
import { SchedulerAssignmentsService } from './scheduler-assignments.service';

@Module({
  imports: [PrismaModule, ActivitiesModule, NotificationsModule, DashboardModule, GraphMailModule],
  controllers: [SchedulerAssignmentsController],
  providers: [SchedulerAssignmentsService],
  exports: [SchedulerAssignmentsService],
})
export class SchedulerAssignmentsModule {}
