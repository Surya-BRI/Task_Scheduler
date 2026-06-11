import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/constants/roles.enum';
import type { JwtPayload } from '../common/types/jwt-payload.type';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('metrics')
  getMetrics(@CurrentUser() user: JwtPayload) {
    return this.dashboardService.getMetrics(user.sub, user.role);
  }

  @Get('projects-overview')
  @Roles(UserRole.HOD)
  getProjectsOverview(
    @Query('weekStart') weekStart?: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.dashboardService.getProjectsOverview(weekStart, user?.sub, user?.role);
  }
}
