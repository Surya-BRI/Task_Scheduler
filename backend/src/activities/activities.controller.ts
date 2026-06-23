import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ActivitiesService } from './activities.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/constants/roles.enum';
import type { JwtPayload } from '../common/types/jwt-payload.type';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('activities')
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  @Get()
  @Roles(UserRole.HOD, UserRole.DESIGNER, UserRole.SALESPERSON, UserRole.QS)
  findAll(
    @Query('limit') limit?: string,
    @Query('userId') userId?: string,
    @CurrentUser() currentUser?: JwtPayload,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 50;
    return this.activitiesService.findAll({
      limit: parsedLimit,
      userId,
      requestingUserId: currentUser?.sub,
      requestingUserRole: currentUser?.role,
    });
  }

  @Get('task/:taskId')
  @Roles(UserRole.HOD, UserRole.DESIGNER, UserRole.SALESPERSON, UserRole.QS)
  findByTask(
    @Param('taskId') taskId: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @CurrentUser() currentUser?: JwtPayload,
  ) {
    return this.activitiesService.findByTask({
      taskId,
      limit: limit ? parseInt(limit, 10) : 30,
      cursor,
      requestingUserId: currentUser?.sub,
      requestingUserRole: currentUser?.role,
    });
  }

  @Get('project/:projectId')
  @Roles(UserRole.HOD, UserRole.DESIGNER, UserRole.SALESPERSON, UserRole.QS)
  findByProject(
    @Param('projectId') projectId: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @CurrentUser() currentUser?: JwtPayload,
  ) {
    return this.activitiesService.findByProject({
      projectId,
      limit: limit ? parseInt(limit, 10) : 30,
      cursor,
      requestingUserId: currentUser?.sub,
      requestingUserRole: currentUser?.role,
    });
  }
}
