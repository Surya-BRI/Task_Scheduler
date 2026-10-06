import { Module } from '@nestjs/common';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ActivitiesModule } from '../activities/activities.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { SchedulerAssignmentsModule } from '../scheduler-assignments/scheduler-assignments.module';
import { GraphMailModule } from '../graph-mail/graph-mail.module';

@Module({
  imports: [PrismaModule, ActivitiesModule, DashboardModule, SchedulerAssignmentsModule, GraphMailModule],
  controllers: [RequestsController],
  providers: [RequestsService]
})
export class RequestsModule {}
