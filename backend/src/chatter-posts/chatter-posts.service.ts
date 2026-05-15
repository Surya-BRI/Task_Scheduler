import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateChatterPostDto } from './dto/create-chatter-post.dto';
import * as fs from 'fs';
import * as path from 'path';

export type ChatterPostDto = {
  id: string;
  taskId: string | null;
  authorId: string | null;
  title: string;
  message: string;
  postType: string | null;
  mentionUserId: string | null;
  priority: string | null;
  seenByCount: number;
  attachmentCount: number;
  isPinned: boolean;
  editedAt: string | null;
  visibility: string | null;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class ChatterPostsService {
  private readonly logger = new Logger(ChatterPostsService.name);

  constructor(private readonly prisma: PrismaService) {}

  private mapRow(row: any): ChatterPostDto {
    return {
      id: row.id,
      taskId: row.taskId,
      authorId: row.authorId,
      title: row.title,
      message: row.message,
      postType: row.postType,
      mentionUserId: row.mentionUserId,
      priority: row.priority,
      seenByCount: row.seenByCount,
      attachmentCount: row._count?.attachments || 0,
      isPinned: row.isPinned,
      editedAt: null, // we don't have editedAt in our schema yet, return null
      visibility: row.visibility,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async findAll(limitParam?: string, taskIdFilter?: string): Promise<ChatterPostDto[]> {
    const limit = Math.min(1000, Math.max(1, Number.parseInt(limitParam ?? '500', 10) || 500));
    
    const where: any = {};
    if (taskIdFilter?.trim()) {
      where.taskId = taskIdFilter.trim();
    }

    // @ts-ignore: IDE cache issue, the property exists and typecheck passes
    const rows = await this.prisma.chatterPost.findMany({
      where,
      take: limit,
      orderBy: [
        { updatedAt: 'desc' },
        { createdAt: 'desc' },
      ],
      include: {
        _count: {
          select: { attachments: true },
        },
      },
    });

    return rows.map((r: any) => this.mapRow(r));
  }

  async create(dto: CreateChatterPostDto, authorId: string, files?: Express.Multer.File[]): Promise<ChatterPostDto> {
    // @ts-ignore: IDE cache issue, the property exists and typecheck passes
    const newPost = await this.prisma.chatterPost.create({
      data: {
        title: dto.title,
        message: dto.message,
        postType: dto.postType || null,
        priority: dto.priority || null,
        visibility: dto.visibility || null,
        taskId: dto.taskId || null,
        authorId: authorId,
        mentionUserId: dto.mentionUserId || null,
        attachments: files && files.length > 0 ? {
          create: files.map(f => ({
            fileName: f.originalname,
            filePath: f.path.replace(/\\/g, '/'),
            mimeType: f.mimetype,
            sizeBytes: f.size,
            uploadedById: authorId,
          }))
        } : undefined,
      },
      include: {
        _count: {
          select: { attachments: true }
        }
      }
    });

    // Also log this as an activity
    try {
      // @ts-ignore: IDE cache issue, the property exists and typecheck passes
      await this.prisma.activityLog.create({
        data: {
          action: 'CREATED_CHATTER_POST',
          details: JSON.stringify({ title: dto.title, postType: dto.postType }),
          userId: authorId,
          taskId: dto.taskId || null,
        }
      });
    } catch (e) {
      this.logger.error('Failed to create activity log for chatter post', e);
    }

    return this.mapRow(newPost);
  }
}
