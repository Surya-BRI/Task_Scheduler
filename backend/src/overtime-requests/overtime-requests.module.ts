import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TasksModule } from '../tasks/tasks.module';
import { OvertimeRequestsController } from './overtime-requests.controller';
import { OvertimeRequestsService } from './overtime-requests.service';

@Module({
  imports: [PrismaModule, TasksModule],
  controllers: [OvertimeRequestsController],
  providers: [OvertimeRequestsService],
})
export class OvertimeRequestsModule {}
