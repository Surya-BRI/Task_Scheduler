import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { SchedulerAssignmentsService } from './scheduler-assignments.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/constants/roles.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/types/jwt-payload.type';
import { SaveSchedulerWeekDto } from './dto/save-scheduler-week.dto';
import { UpdateOvertimeSchedulerActionDto } from './dto/update-overtime-scheduler-action.dto';
import { DetachAssignmentPartDto } from './dto/detach-assignment-part.dto';
import { resolveDesignerScope } from '../common/utils/resolve-designer-scope.util';
import { hasDepartmentManagerAccess } from '../common/utils/workflow-roles.util';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('scheduler-assignments')
export class SchedulerAssignmentsController {
  constructor(private readonly schedulerAssignmentsService: SchedulerAssignmentsService) {}

  @Get()
  @Roles(UserRole.HOD, UserRole.DESIGNER)
  findForWeek(
    @Query('weekStart') weekStart?: string,
    @Query('designerId') designerId?: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    const ws = weekStart?.trim() ?? '';
    if (!ws) {
      return [];
    }
    const trimmedDesignerId = designerId?.trim();
    // resolveDesignerScope defaults to the caller's own id whenever no designerId is passed —
    // correct for a plain DESIGNER (their own schedule), but wrong here for an HOD: the
    // scheduler grid's normal "give me the whole week" call never passes a designerId, so an
    // HOD's own reload was silently scoped to only their own rows, making every OTHER
    // designer's correctly-saved assignments disappear on every refresh. An HOD with no
    // designerId explicitly requested should see the whole week; resolveDesignerScope's
    // access check still applies whenever a SPECIFIC designerId is requested.
    const scopedDesignerId =
      !trimmedDesignerId && user && hasDepartmentManagerAccess(user.role)
        ? undefined
        : user
          ? resolveDesignerScope(designerId, user.sub, user.role)
          : trimmedDesignerId || undefined;
    return this.schedulerAssignmentsService.findForWeekStart(ws, scopedDesignerId || undefined);
  }

  @Get('week/:weekStart/meta')
  @Roles(UserRole.HOD, UserRole.DESIGNER)
  getWeekMeta(@Param('weekStart') weekStart: string) {
    return this.schedulerAssignmentsService.getWeekMeta(weekStart);
  }

  @Put('week/:weekStart')
  @Roles(UserRole.HOD)
  saveWeek(
    @Param('weekStart') weekStart: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: SaveSchedulerWeekDto,
  ) {
    return this.schedulerAssignmentsService.saveWeekSnapshot(weekStart, user.sub, dto);
  }

  @Post('week/:weekStart/lock')
  @Roles(UserRole.HOD)
  lockWeek(@Param('weekStart') weekStart: string, @CurrentUser() user: JwtPayload) {
    return this.schedulerAssignmentsService.setWeekLock(weekStart, user.sub, true);
  }

  @Delete('week/:weekStart/lock')
  @Roles(UserRole.HOD)
  unlockWeek(@Param('weekStart') weekStart: string, @CurrentUser() user: JwtPayload) {
    return this.schedulerAssignmentsService.setWeekLock(weekStart, user.sub, false);
  }

  @Delete('task/:taskId')
  @Roles(UserRole.HOD, UserRole.ADMIN, UserRole.PROJECT_MANAGER)
  clearTask(@Param('taskId') taskId: string) {
    return this.schedulerAssignmentsService.clearTaskSchedule(taskId);
  }

  @Post(':id/detach')
  @Roles(UserRole.HOD)
  detachPart(@Param('id') id: string, @Body() dto: DetachAssignmentPartDto) {
    return this.schedulerAssignmentsService.detachAssignmentPart(id, dto.status);
  }

  @Post('fragments/:id/status')
  @Roles(UserRole.HOD)
  updateFragmentStatus(@Param('id') id: string, @Body() dto: DetachAssignmentPartDto) {
    return this.schedulerAssignmentsService.updateFragmentStatus(id, dto.status);
  }

  @Post('overtime-requests/:requestId/action')
  @Roles(UserRole.HOD)
  updateOvertimeRequestAction(
    @Param('requestId') requestId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateOvertimeSchedulerActionDto,
  ) {
    return this.schedulerAssignmentsService.updateOvertimeRequestSchedulerAction(
      requestId,
      user.sub,
      dto.action,
    );
  }
}
