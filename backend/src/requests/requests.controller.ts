import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { RequestsService } from './requests.service';
import { CreateLeaveRequestDto } from './dto/create-request.dto';
import { ReviewLeaveRequestDto } from './dto/review-leave-request.dto';
import { UpdateLeaveRequestDto } from './dto/update-leave-request.dto';
import { UpdateRequestStatusDto } from './dto/update-request-status.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/constants/roles.enum';
import type { JwtPayload } from '../common/types/jwt-payload.type';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('requests')
export class RequestsController {
  constructor(private readonly requestsService: RequestsService) {}

  @Get('pending-approvals')
  @Roles(UserRole.HOD)
  findPendingApprovals(@CurrentUser() user: JwtPayload) {
    return this.requestsService.findPendingApprovals(user.sub, user.role);
  }

  @Get('team-requests')
  @Roles(UserRole.HOD)
  findTeamRequests(
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: string,
    @Query('designerId') designerId?: string,
  ) {
    return this.requestsService.findTeamRequests(user.sub, user.role, { status, designerId });
  }

  @Get()
  @Roles(UserRole.DESIGNER)
  findAll(@Query('designerId') designerId: string | undefined, @CurrentUser() user: JwtPayload) {
    const targetId = (designerId ?? user.sub ?? '').trim();
    if (!targetId) return [];
    return this.requestsService.findAll(designerId, user.sub, user.role);
  }

  @Post()
  @Roles(UserRole.DESIGNER)
  create(@CurrentUser() user: JwtPayload, @Body() createDto: CreateLeaveRequestDto) {
    return this.requestsService.create(user.sub, user.role, createDto);
  }

  @Patch(':id')
  @Roles(UserRole.DESIGNER)
  update(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateLeaveRequestDto,
  ) {
    if (!UUID_RE.test(id.trim())) {
      throw new BadRequestException('Leave request id must be a valid UUID');
    }
    return this.requestsService.update(id, user.sub, user.role, dto);
  }

  @Post(':id/cancel')
  @Roles(UserRole.DESIGNER)
  cancel(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    if (!UUID_RE.test(id.trim())) {
      throw new BadRequestException('Leave request id must be a valid UUID');
    }
    return this.requestsService.cancel(id, user.sub, user.role);
  }

  @Post(':id/review')
  @Roles(UserRole.HOD)
  review(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: ReviewLeaveRequestDto,
  ) {
    if (!UUID_RE.test(id.trim())) {
      throw new BadRequestException('Leave request id must be a valid UUID');
    }
    return this.requestsService.review(id, user.sub, user.role, dto);
  }

  @Patch(':id/status')
  @Roles(UserRole.HOD)
  updateStatus(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() updateDto: UpdateRequestStatusDto,
  ) {
    if (!UUID_RE.test(id.trim())) {
      throw new BadRequestException('Leave request id must be a valid UUID');
    }
    return this.requestsService.updateStatus(id, user.sub, user.role, updateDto);
  }
}
