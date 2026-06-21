import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CreateChatterCommentDto } from './dto/create-chatter-comment.dto';
import { CreateChatterPostDto } from './dto/create-chatter-post.dto';
import { MarkChatterPostsSeenDto } from './dto/mark-chatter-posts-seen.dto';
import { UpdateChatterCommentDto, UpdateChatterPostDto } from './dto/update-chatter-post.dto';
import { ChatterPostsService } from './chatter-posts.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { isAllowedUploadMime } from '../common/utils/allowed-file-mime';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

@UseGuards(JwtAuthGuard)
@Controller('chatter-posts')
export class ChatterPostsController {
  private readonly logger = new Logger(ChatterPostsController.name);

  constructor(private readonly chatterPostsService: ChatterPostsService) {}

  @Get('mention-users')
  listMentionUsers(
    @CurrentUser() user: { sub: string; role: string },
    @Query('taskId') taskId?: string,
    @Query('projectId') projectId?: string,
  ) {
    return this.chatterPostsService.listMentionUsers(user.sub, user.role, taskId, projectId);
  }

  @Get()
  findAll(
    @Query('limit') limit?: string,
    @Query('taskId') taskId?: string,
    @Query('projectId') projectId?: string,
    @Query('mentionUserId') mentionUserId?: string,
    @Query('commentedByUserId') commentedByUserId?: string,
    @Query('postType') postType?: string,
    @Query('weekStart') weekStart?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.chatterPostsService.findAll(
      limit,
      taskId,
      projectId,
      mentionUserId,
      commentedByUserId,
      postType,
      weekStart,
      cursor,
    );
  }

  @Post('seen')
  markPostsSeen(
    @Body() dto: MarkChatterPostsSeenDto,
    @CurrentUser() user: { sub: string },
  ) {
    return this.chatterPostsService.markPostsSeen(dto.postIds, user.sub);
  }

  @Get(':postId')
  async findOne(@Param('postId') postId: string) {
    const post = await this.chatterPostsService.loadPostById(postId);
    if (!post) throw new NotFoundException('Chatter post not found');
    return post;
  }

  @Get(':postId/comments')
  findComments(@Param('postId') postId: string) {
    return this.chatterPostsService.findCommentsForPost(postId);
  }

  @Post(':postId/comments')
  createComment(
    @Param('postId') postId: string,
    @Body() dto: CreateChatterCommentDto,
    @CurrentUser() user: { sub: string; role: string },
  ) {
    return this.chatterPostsService.createComment(postId, dto, user.sub, user.role);
  }

  @Patch(':postId/comments/:commentId')
  updateComment(
    @Param('postId') postId: string,
    @Param('commentId') commentId: string,
    @Body() dto: UpdateChatterCommentDto,
    @CurrentUser() user: { sub: string },
  ) {
    return this.chatterPostsService.updateComment(postId, commentId, dto, user.sub);
  }

  @Delete(':postId/comments/:commentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteComment(
    @Param('postId') postId: string,
    @Param('commentId') commentId: string,
    @CurrentUser() user: { sub: string },
  ) {
    return this.chatterPostsService.deleteComment(postId, commentId, user.sub);
  }

  @Post()
  @UseInterceptors(FilesInterceptor('files', 10, {
    storage: memoryStorage(),
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (_req, file, cb) => {
      if (isAllowedUploadMime(file.mimetype, file.originalname)) {
        cb(null, true);
      } else {
        cb(new Error(`Unsupported file type: ${file.mimetype || 'unknown'} (${file.originalname})`), false);
      }
    },
  }))
  create(
    @Body() createChatterPostDto: CreateChatterPostDto,
    @CurrentUser() user: any,
    @UploadedFiles() files?: Express.Multer.File[]
  ) {
    this.logger.log('Request received: POST /chatter-posts');
    const fileCount = files?.length ?? 0;
    if (fileCount > 0) {
      for (const f of files!) {
        const bufLen = Buffer.isBuffer(f.buffer) ? f.buffer.length : 0;
        this.logger.log(
          `File parsed: name=${f.originalname} mime=${f.mimetype} size=${f.size} bufferBytes=${bufLen}`,
        );
      }
    } else {
      this.logger.log('File parsed: no files in multipart payload');
    }
    return this.chatterPostsService.create(createChatterPostDto, user.sub, user.role, files);
  }

  @Patch(':id/pin')
  togglePin(
    @Param('id') id: string,
    @Body('isPinned') isPinned: boolean,
    @CurrentUser() user: { sub: string },
  ) {
    return this.chatterPostsService.togglePin(id, isPinned, user.sub);
  }

  @Post(':id/like')
  likePost(
    @Param('id') id: string,
    @CurrentUser() user: { sub: string },
  ) {
    return this.chatterPostsService.likePost(id, user.sub);
  }

  @Patch(':id')
  updatePost(
    @Param('id') id: string,
    @Body() dto: UpdateChatterPostDto,
    @CurrentUser() user: { sub: string },
  ) {
    return this.chatterPostsService.updatePost(id, dto, user.sub);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deletePost(
    @Param('id') id: string,
    @CurrentUser() user: { sub: string },
  ) {
    return this.chatterPostsService.deletePost(id, user.sub);
  }
}
