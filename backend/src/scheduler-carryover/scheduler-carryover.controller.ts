import { Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/constants/roles.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/types/jwt-payload.type';
import { SchedulerAssignmentsService } from '../scheduler-assignments/scheduler-assignments.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityAction } from '../activities/activity-events';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('scheduler-carryover')
export class SchedulerCarryoverController {
  constructor(
    private readonly schedulerAssignmentsService: SchedulerAssignmentsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('last-run')
  @Roles(UserRole.HOD)
  async getLastRun() {
    const row = await this.prisma.activityLog.findFirst({
      where: { action: ActivityAction.SCHEDULER_CARRYOVER },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    return { lastRunAt: row?.createdAt ?? null };
  }

  @Post('trigger')
  @Roles(UserRole.HOD)
  @HttpCode(200)
  async triggerCarryover(@CurrentUser() user: JwtPayload) {
    return this.schedulerAssignmentsService.carryOverPastDueAssignments(user.sub);
  }
}
