import { Module } from '@nestjs/common';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ActivitiesModule } from '../activities/activities.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { SchedulerAssignmentsModule } from '../scheduler-assignments/scheduler-assignments.module';

@Module({
  imports: [PrismaModule, ActivitiesModule, DashboardModule, SchedulerAssignmentsModule],
  controllers: [RequestsController],
  providers: [RequestsService]
})
export class RequestsModule {}
