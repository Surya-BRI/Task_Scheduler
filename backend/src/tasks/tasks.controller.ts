import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { AssignTaskDto } from './dto/assign-task.dto';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/constants/roles.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/types/jwt-payload.type';

@Controller('tasks')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  /** POST /tasks — HOD/Admin/PM */
  @Post()
  @Roles(UserRole.HOD, UserRole.ADMIN, UserRole.PROJECT_MANAGER)
  create(@Body() dto: CreateTaskDto) {
    return this.tasksService.create(dto);
  }

  /**
   * GET /tasks
   *   ?projectId=&status=&priority=&assigneeId=&search=&page=1&limit=20
   */
  @Get()
  @Roles(UserRole.HOD, UserRole.DESIGNER, UserRole.ADMIN, UserRole.PROJECT_MANAGER)
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('projectId') projectId?: string,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('assigneeId') assigneeId?: string,
    @Query('search') search?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ) {
    return this.tasksService.findAll(user.sub, user.role, {
      projectId,
      status,
      priority,
      assigneeId,
      search,
      page,
      limit,
    });
  }

  /** GET /tasks/summary — dashboard widget */
  @Get('summary')
  @Roles(UserRole.HOD, UserRole.DESIGNER, UserRole.ADMIN, UserRole.PROJECT_MANAGER)
  getSummary(@CurrentUser() user: JwtPayload) {
    return this.tasksService.getStatusSummary(user.sub, user.role);
  }

  /** GET /tasks/:id */
  @Get(':id')
  @Roles(UserRole.HOD, UserRole.DESIGNER, UserRole.ADMIN, UserRole.PROJECT_MANAGER)
  findOne(@Param('id') id: string) {
    return this.tasksService.findOne(id);
  }

  /** PATCH /tasks/:id — HOD/Admin/PM */
  @Patch(':id')
  @Roles(UserRole.HOD, UserRole.ADMIN, UserRole.PROJECT_MANAGER)
  update(@Param('id') id: string, @Body() dto: UpdateTaskDto) {
    return this.tasksService.update(id, dto);
  }

  /** PATCH /tasks/:id/assign — HOD/Admin */
  @Patch(':id/assign')
  @Roles(UserRole.HOD, UserRole.ADMIN)
  assign(@Param('id') id: string, @Body() dto: AssignTaskDto) {
    return this.tasksService.assign(id, dto);
  }

  /** PATCH /tasks/:id/status — all authenticated roles */
  @Patch(':id/status')
  @Roles(UserRole.HOD, UserRole.DESIGNER, UserRole.ADMIN, UserRole.PROJECT_MANAGER)
  updateStatus(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateTaskStatusDto,
  ) {
    return this.tasksService.updateStatus(id, user.sub, user.role, dto);
  }

  /** DELETE /tasks/:id — Admin only */
  @Delete(':id')
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.tasksService.remove(id);
  }
}
