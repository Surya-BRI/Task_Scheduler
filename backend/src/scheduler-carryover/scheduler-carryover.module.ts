import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SchedulerAssignmentsModule } from '../scheduler-assignments/scheduler-assignments.module';
import { UsersModule } from '../users/users.module';
import { SchedulerCarryoverService } from './scheduler-carryover.service';
import { SchedulerCarryoverController } from './scheduler-carryover.controller';

@Module({
  imports: [PrismaModule, SchedulerAssignmentsModule, UsersModule],
  controllers: [SchedulerCarryoverController],
  providers: [SchedulerCarryoverService],
})
export class SchedulerCarryoverModule {}
