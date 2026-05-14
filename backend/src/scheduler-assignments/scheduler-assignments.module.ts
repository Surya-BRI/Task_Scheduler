import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SchedulerAssignmentsController } from './scheduler-assignments.controller';
import { SchedulerAssignmentsService } from './scheduler-assignments.service';

@Module({
  imports: [PrismaModule],
  controllers: [SchedulerAssignmentsController],
  providers: [SchedulerAssignmentsService],
})
export class SchedulerAssignmentsModule {}
