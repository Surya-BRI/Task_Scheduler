import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CreateRegularizationRequestDto } from './dto/create-regularization-request.dto';
import { ReviewRegularizationRequestDto } from './dto/review-regularization-request.dto';
import { UpdateRegularizationStatusDto } from './dto/update-regularization-status.dto';
import { RegularizationRequestsService } from './regularization-requests.service';
import { isUuidString } from './sql-uuid.util';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/constants/roles.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/types/jwt-payload.type';
import { resolveDesignerScope } from '../common/utils/resolve-designer-scope.util';

@Controller('regularization-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RegularizationRequestsController {
  constructor(private readonly regularizationRequestsService: RegularizationRequestsService) {}

  @Get('task-options')
  @Roles(UserRole.DESIGNER, UserRole.HOD)
  listTaskOptions(
    @Query('designerId') designerIdParam: string | undefined,
    @Query('date') date: string | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    const designerId = (designerIdParam ?? user?.sub ?? '').trim();
    if (!designerId) return [];
    if (!isUuidString(designerId)) {
      throw new BadRequestException('Query designerId must be a UUID.');
    }
    if (user.role !== UserRole.HOD && designerId !== user.sub) {
      throw new ForbiddenException('You can only view your own regularization task options.');
    }
    return this.regularizationRequestsService.listTaskOptions(designerId, date ?? '');
  }

  @Get('pending-approvals')
  @Roles(UserRole.HOD)
  findPendingApprovals(@CurrentUser() user: JwtPayload) {
    return this.regularizationRequestsService.findPendingApprovals(user.sub, user.role);
  }

  @Get('team-requests')
  @Roles(UserRole.HOD)
  findTeamRequests(
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: string,
    @Query('designerId') designerId?: string,
  ) {
    return this.regularizationRequestsService.findTeamRequests(user.sub, user.role, { status, designerId });
  }

  @Get()
  @Roles(UserRole.DESIGNER, UserRole.HOD)
  findByDesigner(@Query('designerId') designerIdParam?: string, @CurrentUser() user?: JwtPayload) {
    if (!user?.sub) return [];
    const designerId = resolveDesignerScope(designerIdParam, user.sub, user.role);
    if (!designerId) return [];
    if (!isUuidString(designerId)) {
      throw new BadRequestException('Query designerId must be a UUID.');
    }
    return this.regularizationRequestsService.findByDesigner(designerId);
  }

  @Get(':id')
  @Roles(UserRole.DESIGNER, UserRole.HOD)
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.regularizationRequestsService.findOne(id, user.sub, user.role);
  }

  @Post()
  @Roles(UserRole.DESIGNER, UserRole.HOD)
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateRegularizationRequestDto) {
    return this.regularizationRequestsService.create(user.sub, user.role, dto);
  }

  @Post(':id/review')
  @Roles(UserRole.HOD)
  review(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: ReviewRegularizationRequestDto,
  ) {
    return this.regularizationRequestsService.review(id, user.sub, user.role, dto);
  }

  @Patch(':id')
  @Roles(UserRole.HOD)
  updateStatus(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateRegularizationStatusDto,
  ) {
    return this.regularizationRequestsService.updateStatus(id, dto, user.sub, user.role);
  }
}
