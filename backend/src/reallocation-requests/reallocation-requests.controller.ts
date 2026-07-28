import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/constants/roles.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/types/jwt-payload.type';
import { hasDepartmentManagerAccess } from '../common/utils/workflow-roles.util';
import { resolveDesignerScope } from '../common/utils/resolve-designer-scope.util';
import {
  CreateReallocationRequestDto,
  ReviewReallocationRequestDto,
} from './dto/reallocation-request.dto';
import { ReallocationRequestsService } from './reallocation-requests.service';
import { isUuidString } from './sql-uuid.util';

@Controller('reallocation-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReallocationRequestsController {
  constructor(private readonly reallocationRequestsService: ReallocationRequestsService) {}

  @Get('task-options')
  @Roles(UserRole.DESIGNER, UserRole.HOD, UserRole.SALESPERSON)
  listTaskOptions(
    @Query('designerId') designerIdParam: string | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    const designerId = (designerIdParam ?? user?.sub ?? '').trim();
    if (!designerId) return [];
    if (!isUuidString(designerId)) {
      throw new BadRequestException('Query designerId must be a UUID.');
    }
    if (!hasDepartmentManagerAccess(user.role) && designerId !== user.sub) {
      throw new ForbiddenException('You can only view your own reallocation task options.');
    }
    return this.reallocationRequestsService.listTaskOptions(designerId);
  }

  @Get('eligible-designers')
  @Roles(UserRole.DESIGNER, UserRole.HOD, UserRole.SALESPERSON)
  listEligibleDesigners(
    @Query('taskId') taskId: string | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!taskId || !isUuidString(taskId)) {
      throw new BadRequestException('Query taskId must be a UUID.');
    }
    return this.reallocationRequestsService.listEligibleDesigners(taskId, user.sub);
  }

  @Get('pending-approvals')
  @Roles(UserRole.HOD, UserRole.SALESPERSON)
  findPendingApprovals() {
    return this.reallocationRequestsService.findPendingApprovals();
  }

  @Get('team-requests')
  @Roles(UserRole.HOD, UserRole.SALESPERSON)
  findTeamRequests(
    @Query('status') status?: string,
    @Query('designerId') designerId?: string,
  ) {
    return this.reallocationRequestsService.findTeamRequests({ status, designerId });
  }

  @Get()
  @Roles(UserRole.DESIGNER, UserRole.HOD, UserRole.SALESPERSON)
  findByRequester(@Query('designerId') designerIdParam?: string, @CurrentUser() user?: JwtPayload) {
    if (!user?.sub) return [];
    const designerId = resolveDesignerScope(designerIdParam, user.sub, user.role);
    if (!designerId) return [];
    if (!isUuidString(designerId)) {
      throw new BadRequestException('Query designerId must be a UUID.');
    }
    return this.reallocationRequestsService.findByRequester(designerId);
  }

  @Get(':id')
  @Roles(UserRole.DESIGNER, UserRole.HOD, UserRole.SALESPERSON)
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.reallocationRequestsService.findOne(id, user.sub, user.role);
  }

  @Post()
  @Roles(UserRole.DESIGNER, UserRole.HOD)
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateReallocationRequestDto) {
    return this.reallocationRequestsService.create(user.sub, user.role, dto);
  }

  @Post(':id/cancel')
  @Roles(UserRole.DESIGNER, UserRole.HOD)
  cancel(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.reallocationRequestsService.cancel(id, user.sub);
  }

  @Post(':id/review')
  @Roles(UserRole.HOD, UserRole.SALESPERSON)
  review(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: ReviewReallocationRequestDto,
  ) {
    return this.reallocationRequestsService.review(id, user.sub, user.role, dto);
  }
}
