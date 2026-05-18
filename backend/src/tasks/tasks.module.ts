import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { PrismaModule } from '../prisma/prisma.module';
import { TaskFilesService } from './task-files.service';
import { ActivitiesModule } from '../activities/activities.module';

@Module({
  imports: [PrismaModule, ActivitiesModule],
  controllers: [TasksController],
  providers: [TasksService, TaskFilesService],
  exports: [TaskFilesService],
})
export class TasksModule {}
