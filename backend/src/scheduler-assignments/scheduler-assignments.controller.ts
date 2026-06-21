import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { SchedulerAssignmentsService } from './scheduler-assignments.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/constants/roles.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/types/jwt-payload.type';
import { SaveSchedulerWeekDto } from './dto/save-scheduler-week.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('scheduler-assignments')
export class SchedulerAssignmentsController {
  constructor(private readonly schedulerAssignmentsService: SchedulerAssignmentsService) {}

  @Get()
  @Roles(UserRole.HOD, UserRole.DESIGNER)
  findForWeek(@Query('weekStart') weekStart?: string, @Query('designerId') designerId?: string) {
    const ws = weekStart?.trim() ?? '';
    if (!ws) {
      return [];
    }
    return this.schedulerAssignmentsService.findForWeekStart(ws, designerId?.trim() || undefined);
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
}
