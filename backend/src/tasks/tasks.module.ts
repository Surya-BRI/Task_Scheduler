import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { PrismaModule } from '../prisma/prisma.module';
import { TaskFilesService } from './task-files.service';
import { ActivitiesModule } from '../activities/activities.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { GraphMailModule } from '../graph-mail/graph-mail.module';
import { SchedulerAssignmentsModule } from '../scheduler-assignments/scheduler-assignments.module';

@Module({
  imports: [PrismaModule, ActivitiesModule, DashboardModule, NotificationsModule, GraphMailModule, SchedulerAssignmentsModule],
  controllers: [TasksController],
  providers: [TasksService, TaskFilesService],
  exports: [TaskFilesService, TasksService],
})
export class TasksModule {}
