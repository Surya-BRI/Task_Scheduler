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
import { Throttle } from '@nestjs/throttler';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { CreateExtendedTaskDto } from './dto/create-extended-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { AssignTaskDto } from './dto/assign-task.dto';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto';
import { SubmitWorkDto } from './dto/submit-work.dto';
import { SaveTimerStateDto } from './dto/save-timer-state.dto';
import { FreezeDraftWorkSessionDto } from './dto/freeze-draft-work-session.dto';
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

  /** POST /tasks — HOD/Sales department managers */
  @Post()
  @Roles(UserRole.HOD, UserRole.SALESPERSON)
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateTaskDto) {
    return this.tasksService.create(user.sub, dto);
  }

  /** POST /tasks/extended — HOD/Sales department managers */
  @Post('extended')
  @Roles(UserRole.HOD, UserRole.SALESPERSON)
  createExtended(@CurrentUser() user: JwtPayload, @Body() dto: CreateExtendedTaskDto) {
    return this.tasksService.createExtended(user.sub, dto);
  }

  @Post('upload-file')
  @Roles(UserRole.HOD, UserRole.SALESPERSON)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
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
    @Query('excludeStatuses') excludeStatuses?: string,
    @Query('priority') priority?: string,
    @Query('assigneeId') assigneeId?: string,
    @Query('search') search?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
    @Query('salesQueue') salesQueue?: string,
  ) {
    return this.tasksService.findAll(user.sub, user.role, {
      projectId,
      status,
      excludeStatuses,
      priority,
      assigneeId,
      search,
      page,
      limit,
      salesQueue: salesQueue === 'true' || salesQueue === '1',
    });
  }

  /** GET /tasks/summary — dashboard widget */
  @Get('next-revision')
  @Roles(UserRole.HOD, UserRole.DESIGNER, UserRole.SALESPERSON)
  getNextRevision(
    @Query('projectId') projectId?: string,
    @Query('projectNo') projectNo?: string,
    @Query('opNo') opNo?: string,
    @Query('designType') designType?: string,
  ) {
    return this.tasksService.getNextRevision({ projectId, projectNo, opNo, designType });
  }

  /** GET /tasks/next-phase — suggested release phase for a project's next Create-Task batch */
  @Get('next-phase')
  @Roles(UserRole.HOD, UserRole.DESIGNER, UserRole.SALESPERSON)
  getNextPhase(
    @Query('projectId') projectId?: string,
    @Query('projectNo') projectNo?: string,
    @Query('opNo') opNo?: string,
    @Query('designType') designType?: string,
  ) {
    return this.tasksService.getNextPhase({ projectId, projectNo, opNo, designType });
  }

  @Get('summary')
  @Roles(UserRole.HOD, UserRole.DESIGNER, UserRole.SALESPERSON)
  getSummary(@CurrentUser() user: JwtPayload) {
    return this.tasksService.getStatusSummary(user.sub, user.role);
  }

  /** GET /tasks/scheduler-queue — sidebar backlog (unassigned + on-hold only). */
  @Get('scheduler-queue')
  @Roles(UserRole.HOD)
  findSchedulerQueue() {
    return this.tasksService.findSchedulerQueue();
  }

  /** GET /tasks/running-timer — designer's currently running draft timer (if any) */
  @Get('running-timer')
  @Roles(UserRole.DESIGNER, UserRole.HOD)
  getRunningTimer(@CurrentUser() user: JwtPayload) {
    return this.tasksService.getRunningTimerForDesigner(user.sub);
  }

  /** GET /tasks/:id */
  @Get(':id')
  @Roles(UserRole.HOD, UserRole.DESIGNER, UserRole.SALESPERSON, UserRole.QS)
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.tasksService.findOne(id, user.sub, user.role);
  }

  /** PATCH /tasks/:id — HOD/Sales department managers */
  @Patch(':id')
  @Roles(UserRole.HOD, UserRole.SALESPERSON)
  update(@Param('id') id: string, @Body() dto: UpdateTaskDto) {
    return this.tasksService.update(id, dto);
  }

  /** PATCH /tasks/:id/assign — HOD/Sales department managers */
  @Patch(':id/assign')
  @Roles(UserRole.HOD, UserRole.SALESPERSON)
  assign(@Param('id') id: string, @CurrentUser() user: JwtPayload, @Body() dto: AssignTaskDto) {
    return this.tasksService.assign(id, user.sub, dto);
  }

  /** GET /tasks/:id/hold-impact — preview of scheduler parts a Hold would remove */
  @Get(':id/hold-impact')
  @Roles(UserRole.HOD, UserRole.SALESPERSON)
  getHoldImpact(@Param('id') id: string) {
    return this.tasksService.getHoldImpact(id);
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

  /** POST /tasks/:id/freeze-draft-session — finalize draft timer before scheduler handoff */
  @Post(':id/freeze-draft-session')
  @Roles(UserRole.HOD)
  freezeDraftWorkSession(
    @Param('id') id: string,
    @Body() dto: FreezeDraftWorkSessionDto,
  ) {
    return this.tasksService.freezeDraftWorkSession(id, dto.designerId, dto.closeSession ?? true);
  }

  /** GET /tasks/:id/draft-work-peek?designerId= — read logged time without mutating session */
  @Get(':id/draft-work-peek')
  @Roles(UserRole.HOD, UserRole.DESIGNER)
  peekDraftWorkSession(
    @Param('id') id: string,
    @Query('designerId') designerId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const targetDesigner = user.role === UserRole.HOD && designerId ? designerId : user.sub;
    return this.tasksService.peekDraftWorkSession(id, targetDesigner);
  }

  /** POST /tasks/:id/submit-work — all authenticated roles (designer submits their timer work) */
  @Post(':id/submit-work')
  @Roles(UserRole.HOD, UserRole.DESIGNER)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
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

  /** DELETE /tasks/:id — HOD/Sales department managers */
  @Delete(':id')
  @Roles(UserRole.HOD, UserRole.SALESPERSON)
  remove(@Param('id') id: string) {
    return this.tasksService.remove(id);
  }
}
