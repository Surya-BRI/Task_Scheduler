import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ActivitiesModule } from '../activities/activities.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { SchedulerAssignmentsModule } from '../scheduler-assignments/scheduler-assignments.module';
import { ReallocationRequestsController } from './reallocation-requests.controller';
import { ReallocationRequestsService } from './reallocation-requests.service';

@Module({
  imports: [
    PrismaModule,
    ActivitiesModule,
    DashboardModule,
    SchedulerAssignmentsModule,
  ],
  controllers: [ReallocationRequestsController],
  providers: [ReallocationRequestsService],
  exports: [ReallocationRequestsService],
})
export class ReallocationRequestsModule {}
