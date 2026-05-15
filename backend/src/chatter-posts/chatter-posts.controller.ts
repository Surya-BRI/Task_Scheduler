import { Body, Controller, Get, Post, Query, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { CreateChatterPostDto } from './dto/create-chatter-post.dto';
import { ChatterPostsService } from './chatter-posts.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('chatter-posts')
export class ChatterPostsController {
  constructor(private readonly chatterPostsService: ChatterPostsService) {}

  @Get('mention-users')
  listMentionUsers() {
    return this.chatterPostsService.listMentionUsers();
  }

  @Get()
  findAll(@Query('limit') limit?: string, @Query('taskId') taskId?: string) {
    return this.chatterPostsService.findAll(limit, taskId);
  }

  @Post()
  @UseInterceptors(FilesInterceptor('files', 10, {
    storage: diskStorage({
      destination: './uploads/chatter',
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, `${uniqueSuffix}${extname(file.originalname)}`);
      }
    })
  }))
  create(
    @Body() createChatterPostDto: CreateChatterPostDto,
    @CurrentUser() user: any,
    @UploadedFiles() files?: Express.Multer.File[]
  ) {
    return this.chatterPostsService.create(createChatterPostDto, user.sub, files);
  }
}
