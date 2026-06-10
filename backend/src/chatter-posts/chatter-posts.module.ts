import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '../users/users.module';
import { TasksModule } from '../tasks/tasks.module';
import { ChatterPostsController } from './chatter-posts.controller';
import { ChatterPostsService } from './chatter-posts.service';
import { ActivitiesModule } from '../activities/activities.module';
import { DashboardModule } from '../dashboard/dashboard.module';

@Module({
  imports: [PrismaModule, UsersModule, ActivitiesModule, TasksModule, DashboardModule],
  controllers: [ChatterPostsController],
  providers: [ChatterPostsService],
})
export class ChatterPostsModule {}
