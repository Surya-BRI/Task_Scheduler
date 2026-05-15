import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '../users/users.module';
import { ChatterPostsController } from './chatter-posts.controller';
import { ChatterPostsService } from './chatter-posts.service';

@Module({
  imports: [PrismaModule, UsersModule],
  controllers: [ChatterPostsController],
  providers: [ChatterPostsService],
})
export class ChatterPostsModule {}
