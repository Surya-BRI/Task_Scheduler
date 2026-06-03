import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TasksModule } from '../tasks/tasks.module';
import { ActivitiesModule } from '../activities/activities.module';
import { OvertimeRequestsController } from './overtime-requests.controller';
import { OvertimeRequestsService } from './overtime-requests.service';

@Module({
  imports: [PrismaModule, TasksModule, ActivitiesModule],
  controllers: [OvertimeRequestsController],
  providers: [OvertimeRequestsService],
})
export class OvertimeRequestsModule {}
