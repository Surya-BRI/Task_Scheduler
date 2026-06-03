import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CreateOvertimeRequestDto } from './dto/create-overtime-request.dto';
import { UpdateOvertimeRequestDto } from './dto/update-overtime-request.dto';
import { ReviewOvertimeRequestDto } from './dto/review-overtime-request.dto';
import { OvertimeRequestsService } from './overtime-requests.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/constants/roles.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/types/jwt-payload.type';

@Controller('overtime-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OvertimeRequestsController {
  constructor(private readonly service: OvertimeRequestsService) {}

  // --- Employee (DESIGNER) APIs ---

  @Post()
  @Roles(UserRole.DESIGNER, UserRole.HOD, UserRole.ADMIN)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateOvertimeRequestDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const creatorId = user.sub;
    const request = await this.service.create(creatorId, user.role, dto);
    if (file) {
      await this.service.uploadAttachment(request.id, file, creatorId);
    }
    return this.service.findOne(request.id, creatorId, user.role);
  }

  @Put(':id')
  @Roles(UserRole.DESIGNER, UserRole.HOD, UserRole.ADMIN)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  async update(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateOvertimeRequestDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const userId = user.sub;
    const request = await this.service.update(id, userId, user.role, dto);
    if (file) {
      await this.service.uploadAttachment(request.id, file, userId);
    }
    return this.service.findOne(request.id, userId, user.role);
  }

  @Post(':id/submit')
  @Roles(UserRole.DESIGNER, UserRole.HOD, UserRole.ADMIN)
  submit(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    const userId = user.sub;
    return this.service.submit(id, userId);
  }

  @Post(':id/withdraw')
  @Roles(UserRole.DESIGNER, UserRole.HOD, UserRole.ADMIN)
  withdraw(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    const userId = user.sub;
    return this.service.withdraw(id, userId);
  }

  @Delete(':id')
  @Roles(UserRole.DESIGNER, UserRole.HOD, UserRole.ADMIN)
  delete(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    const userId = user.sub;
    return this.service.delete(id, userId);
  }

  @Get('my-requests')
  @Roles(UserRole.DESIGNER, UserRole.HOD, UserRole.ADMIN)
  findOwnRequests(
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const userId = user.sub;
    return this.service.findOwnRequests(userId, { status, startDate, endDate });
  }

  @Post(':id/attachment')
  @Roles(UserRole.DESIGNER, UserRole.HOD, UserRole.ADMIN)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  uploadAttachment(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const userId = user.sub;
    if (!file) throw new BadRequestException('No file uploaded');
    return this.service.uploadAttachment(id, file, userId);
  }

  // --- Manager (HOD) APIs ---

  @Get('pending-approvals')
  @Roles(UserRole.HOD, UserRole.ADMIN)
  findPendingApprovals(@CurrentUser() user: JwtPayload) {
    const userId = user.sub;
    return this.service.findPendingApprovals(userId, user.role);
  }

  @Post(':id/review')
  @Roles(UserRole.HOD, UserRole.ADMIN)
  review(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: ReviewOvertimeRequestDto,
  ) {
    const userId = user.sub;
    return this.service.review(id, userId, user.role, dto);
  }

  @Get('team-requests')
  @Roles(UserRole.HOD, UserRole.ADMIN)
  findTeamRequests(
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: string,
    @Query('designerId') designerId?: string,
  ) {
    const userId = user.sub;
    return this.service.findTeamRequests(userId, user.role, { status, designerId });
  }

  // --- HR/Admin APIs ---

  @Get('all')
  @Roles(UserRole.ADMIN)
  findAllRequests(
    @Query('status') status?: string,
    @Query('designerId') designerId?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 50;
    return this.service.findAllRequests({ status, designerId, search, page: pageNum, limit: limitNum });
  }

  @Get('statistics')
  @Roles(UserRole.ADMIN, UserRole.HOD)
  getStatistics() {
    return this.service.getStatistics();
  }

  @Get('export')
  @Roles(UserRole.ADMIN)
  exportReport(@Query('status') status?: string) {
    return this.service.exportReport(status);
  }

  // --- Common APIs ---

  /** GET /overtime-requests?designerId= — list for designer requests page */
  @Get()
  @Roles(UserRole.DESIGNER, UserRole.HOD, UserRole.ADMIN)
  findForDesigner(
    @Query('designerId') designerId?: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    const id = designerId?.trim() || user?.sub;
    if (!id) return [];
    return this.service.findByDesignerForView(id);
  }

  @Get(':id')
  @Roles(UserRole.DESIGNER, UserRole.HOD, UserRole.ADMIN)
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    const userId = user.sub;
    return this.service.findOne(id, userId, user.role);
  }
}
