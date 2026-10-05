import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TasksModule } from '../tasks/tasks.module';
import { ActivitiesModule } from '../activities/activities.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { OvertimeRequestsController } from './overtime-requests.controller';
import { OvertimeRequestsService } from './overtime-requests.service';
import { GraphMailModule } from '../graph-mail/graph-mail.module';

@Module({
  imports: [PrismaModule, TasksModule, ActivitiesModule, DashboardModule, GraphMailModule],
  controllers: [OvertimeRequestsController],
  providers: [OvertimeRequestsService],
})
export class OvertimeRequestsModule {}
