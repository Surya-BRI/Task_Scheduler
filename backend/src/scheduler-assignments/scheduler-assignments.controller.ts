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
  @Roles(UserRole.HOD, UserRole.DESIGNER, UserRole.ADMIN, UserRole.PROJECT_MANAGER)
  findForWeek(@Query('weekStart') weekStart?: string, @Query('designerId') designerId?: string) {
    const ws = weekStart?.trim() ?? '';
    if (!ws) {
      return [];
    }
    return this.schedulerAssignmentsService.findForWeekStart(ws, designerId?.trim() || undefined);
  }

  @Get('week/:weekStart/meta')
  @Roles(UserRole.HOD, UserRole.DESIGNER, UserRole.ADMIN, UserRole.PROJECT_MANAGER)
  getWeekMeta(@Param('weekStart') weekStart: string) {
    return this.schedulerAssignmentsService.getWeekMeta(weekStart);
  }

  @Put('week/:weekStart')
  @Roles(UserRole.HOD, UserRole.ADMIN, UserRole.PROJECT_MANAGER)
  saveWeek(
    @Param('weekStart') weekStart: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: SaveSchedulerWeekDto,
  ) {
    return this.schedulerAssignmentsService.saveWeekSnapshot(weekStart, user.sub, dto);
  }

  @Post('week/:weekStart/lock')
  @Roles(UserRole.HOD, UserRole.ADMIN, UserRole.PROJECT_MANAGER)
  lockWeek(@Param('weekStart') weekStart: string, @CurrentUser() user: JwtPayload) {
    return this.schedulerAssignmentsService.setWeekLock(weekStart, user.sub, true);
  }

  @Delete('week/:weekStart/lock')
  @Roles(UserRole.HOD, UserRole.ADMIN, UserRole.PROJECT_MANAGER)
  unlockWeek(@Param('weekStart') weekStart: string, @CurrentUser() user: JwtPayload) {
    return this.schedulerAssignmentsService.setWeekLock(weekStart, user.sub, false);
  }
}
