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
  Put,
  Query,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { CreateExtendedTaskDto } from './dto/create-extended-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { AssignTaskDto } from './dto/assign-task.dto';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto';
import { SaveSignRowsDto } from './dto/save-sign-rows.dto';
import { SubmitWorkDto } from './dto/submit-work.dto';
import { SaveTimerStateDto } from './dto/save-timer-state.dto';
import { UpdateQsStatusDto } from './dto/update-qs-status.dto';
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
  @Roles(UserRole.HOD)
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateTaskDto) {
    return this.tasksService.create(user.sub, dto);
  }

  /** POST /tasks/extended — HOD/Admin/PM */
  @Post('extended')
  @Roles(UserRole.HOD)
  createExtended(@CurrentUser() user: JwtPayload, @Body() dto: CreateExtendedTaskDto) {
    return this.tasksService.createExtended(user.sub, dto);
  }

  @Post('upload-file')
  @Roles(UserRole.HOD, UserRole.SALESPERSON)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  uploadFile(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: JwtPayload) {
    return this.tasksService.uploadTaskFile(file, user.sub);
  }

  /**
   * GET /tasks
   *   ?projectId=&status=&priority=&assigneeId=&search=&page=1&limit=20
   */
  @Get()
  @Roles(UserRole.HOD, UserRole.DESIGNER, UserRole.SALESPERSON, UserRole.QS)
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
  @Get('next-revision')
  @Roles(UserRole.HOD, UserRole.DESIGNER)
  getNextRevision(
    @Query('projectId') projectId?: string,
    @Query('projectNo') projectNo?: string,
    @Query('opNo') opNo?: string,
    @Query('designType') designType?: string,
  ) {
    return this.tasksService.getNextRevision({ projectId, projectNo, opNo, designType });
  }

  @Get('summary')
  @Roles(UserRole.HOD, UserRole.DESIGNER)
  getSummary(@CurrentUser() user: JwtPayload) {
    return this.tasksService.getStatusSummary(user.sub, user.role);
  }

  /** GET /tasks/:id */
  @Get(':id')
  @Roles(UserRole.HOD, UserRole.DESIGNER, UserRole.SALESPERSON, UserRole.QS)
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.tasksService.findOne(id, user.sub, user.role);
  }

  /** PATCH /tasks/:id — HOD/Admin/PM */
  @Patch(':id')
  @Roles(UserRole.HOD)
  update(@Param('id') id: string, @Body() dto: UpdateTaskDto) {
    return this.tasksService.update(id, dto);
  }

  /** PATCH /tasks/:id/assign — HOD/Admin */
  @Patch(':id/assign')
  @Roles(UserRole.HOD)
  assign(@Param('id') id: string, @CurrentUser() user: JwtPayload, @Body() dto: AssignTaskDto) {
    return this.tasksService.assign(id, user.sub, dto);
  }

  /** PATCH /tasks/:id/status — all authenticated roles */
  @Patch(':id/status')
  @Roles(UserRole.HOD, UserRole.DESIGNER, UserRole.SALESPERSON)
  updateStatus(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateTaskStatusDto,
  ) {
    return this.tasksService.updateStatus(id, user.sub, user.role, dto);
  }

  /** GET /tasks/:id/sign-rows */
  @Get(':id/sign-rows')
  @Roles(UserRole.HOD, UserRole.DESIGNER, UserRole.SALESPERSON, UserRole.QS)
  getSignRows(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.tasksService.getSignRows(id, user.sub, user.role);
  }

  /** GET /tasks/:id/qs-status */
  @Get(':id/qs-status')
  @Roles(UserRole.HOD, UserRole.QS)
  getQsStatus(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.tasksService.getQsStatusForTask(id, user.sub, user.role);
  }

  /** PATCH /tasks/:id/qs-status */
  @Patch(':id/qs-status')
  @Roles(UserRole.HOD, UserRole.QS)
  updateQsStatus(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateQsStatusDto,
  ) {
    return this.tasksService.updateQsStatusForTask(id, dto, user.sub, user.role);
  }

  /** PUT /tasks/:id/sign-rows */
  @Put(':id/sign-rows')
  @Roles(UserRole.HOD, UserRole.QS)
  saveSignRows(@Param('id') id: string, @CurrentUser() user: JwtPayload, @Body() dto: SaveSignRowsDto) {
    return this.tasksService.saveSignRows(id, dto, user.sub, user.role);
  }

  /** POST /tasks/:id/qs-submit */
  @Post(':id/qs-submit')
  @Roles(UserRole.HOD, UserRole.QS)
  submitQsUpdate(@Param('id') id: string, @CurrentUser() user: JwtPayload, @Body() dto: SaveSignRowsDto) {
    return this.tasksService.submitQsUpdate(id, dto, user.sub, user.role);
  }

  /** GET /tasks/:id/submitted-session — fetch the most recent submitted work session */
  @Get(':id/submitted-session')
  @Roles(UserRole.HOD, UserRole.DESIGNER, UserRole.SALESPERSON)
  getSubmittedSession(@Param('id') id: string) {
    return this.tasksService.getSubmittedSession(id);
  }

  /** GET /tasks/:id/timer-state — fetch draft session for cold-start restore */
  @Get(':id/timer-state')
  @Roles(UserRole.HOD, UserRole.DESIGNER)
  getTimerState(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.tasksService.getTimerState(id, user.sub);
  }

  /** POST /tasks/:id/save-timer — upsert draft session on start/pause */
  @Post(':id/save-timer')
  @Roles(UserRole.HOD, UserRole.DESIGNER)
  saveTimerState(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: SaveTimerStateDto,
  ) {
    return this.tasksService.saveTimerState(id, user.sub, dto);
  }

  /** POST /tasks/:id/submit-work — all authenticated roles (designer submits their timer work) */
  @Post(':id/submit-work')
  @Roles(UserRole.HOD, UserRole.DESIGNER)
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  submitWork(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: SubmitWorkDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.tasksService.submitWork(id, user.sub, dto, files ?? []);
  }

  /** DELETE /tasks/:id — HOD only */
  @Delete(':id')
  @Roles(UserRole.HOD)
  remove(@Param('id') id: string) {
    return this.tasksService.remove(id);
  }
}
