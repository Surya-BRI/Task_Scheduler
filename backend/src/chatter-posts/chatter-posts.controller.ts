import { Controller, Get, Query } from '@nestjs/common';
import { ChatterPostsService } from './chatter-posts.service';

@Controller('chatter-posts')
export class ChatterPostsController {
  constructor(private readonly chatterPostsService: ChatterPostsService) {}

  @Get()
  findAll(@Query('limit') limit?: string, @Query('taskId') taskId?: string) {
    return this.chatterPostsService.findAll(limit, taskId);
  }
}
