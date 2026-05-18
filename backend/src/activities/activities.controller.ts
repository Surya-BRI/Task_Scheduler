import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ActivitiesService } from './activities.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/constants/roles.enum';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('activities')
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  @Get()
  @Roles(UserRole.HOD, UserRole.DESIGNER, UserRole.ADMIN, UserRole.PROJECT_MANAGER)
  findAll(@Query('limit') limit?: string) {
    const parsedLimit = limit ? parseInt(limit, 10) : 50;
    return this.activitiesService.findAll({ limit: parsedLimit });
  }

  @Get('task/:taskId')
  @Roles(UserRole.HOD, UserRole.DESIGNER, UserRole.ADMIN, UserRole.PROJECT_MANAGER)
  findByTask(
    @Param('taskId') taskId: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.activitiesService.findByTask({
      taskId,
      limit: limit ? parseInt(limit, 10) : 30,
      cursor,
    });
  }

  @Get('project/:projectId')
  @Roles(UserRole.HOD, UserRole.DESIGNER, UserRole.ADMIN, UserRole.PROJECT_MANAGER)
  findByProject(
    @Param('projectId') projectId: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.activitiesService.findByProject({
      projectId,
      limit: limit ? parseInt(limit, 10) : 30,
      cursor,
    });
  }
}
