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
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Throttle } from '@nestjs/throttler';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { CreateProjectFileLinkDto } from './dto/create-project-file-link.dto';
import { SaveSignRowsDto } from '../tasks/dto/save-sign-rows.dto';
import { UpdateQsStatusDto } from '../tasks/dto/update-qs-status.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/constants/roles.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/types/jwt-payload.type';

@Controller('projects')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  /** POST /projects — HOD/Admin */
  @Post()
  @Roles(UserRole.HOD, UserRole.SALESPERSON)
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateProjectDto) {
    return this.projectsService.create(user.sub, dto);
  }

  /** GET /projects?status=ACTIVE&category=Retail&search=abc&page=1&limit=20 */
  @Get()
  @Roles(UserRole.HOD, UserRole.DESIGNER, UserRole.SALESPERSON, UserRole.QS)
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query('search') search?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit = 50,
  ) {
    return this.projectsService.findAll({ status, category, search, page, limit }, user.sub, user.role);
  }

  /** GET /projects/by-project-no/:projectNo */
  @Get('by-project-no/:projectNo')
  @Roles(UserRole.HOD, UserRole.DESIGNER, UserRole.SALESPERSON, UserRole.QS)
  findByProjectNo(@Param('projectNo') projectNo: string, @CurrentUser() user: JwtPayload) {
    return this.projectsService.findByProjectNo(projectNo, user.sub, user.role);
  }

  /** GET /projects/:id — returns project with its tasks */
  @Get(':id')
  @Roles(UserRole.HOD, UserRole.DESIGNER, UserRole.SALESPERSON, UserRole.QS)
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.projectsService.findOne(id, user.sub, user.role);
  }

  @Post(':id/files')
  @Roles(UserRole.HOD, UserRole.SALESPERSON)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  uploadFile(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.projectsService.uploadProjectFile(id, file, user.sub);
  }

  @Post(':id/files/link')
  @Roles(UserRole.HOD, UserRole.SALESPERSON)
  addFileLink(
    @Param('id') id: string,
    @Body() dto: CreateProjectFileLinkDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.projectsService.addProjectFileLink(id, dto, user.sub);
  }

  @Get(':id/files')
  @Roles(UserRole.HOD, UserRole.DESIGNER, UserRole.SALESPERSON, UserRole.QS)
  getFiles(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.projectsService.getProjectFiles(id, user.sub, user.role);
  }

  @Delete(':id/files/:fileId')
  @Roles(UserRole.HOD, UserRole.SALESPERSON)
  removeFile(@Param('id') id: string, @Param('fileId') fileId: string, @CurrentUser() user: JwtPayload) {
    return this.projectsService.removeProjectFile(id, fileId, user.sub);
  }

  /** PATCH /projects/:id — HOD/Admin */
  @Patch(':id')
  @Roles(UserRole.HOD, UserRole.SALESPERSON)
  update(@Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.projectsService.update(id, dto);
  }

  /** DELETE /projects/:id — Admin only */
  @Delete(':id')
  @Roles(UserRole.HOD, UserRole.SALESPERSON)
  remove(@Param('id') id: string) {
    return this.projectsService.remove(id);
  }

  @Get(':id/sign-rows')
  @Roles(UserRole.HOD, UserRole.DESIGNER, UserRole.SALESPERSON, UserRole.QS)
  getSignRows(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.projectsService.getSignRows(id, user.sub, user.role);
  }

  @Put(':id/sign-rows')
  @Roles(UserRole.HOD, UserRole.QS)
  saveSignRows(@Param('id') id: string, @CurrentUser() user: JwtPayload, @Body() dto: SaveSignRowsDto) {
    return this.projectsService.saveSignRows(id, dto, user.sub, user.role);
  }

  @Get(':id/qs-status')
  @Roles(UserRole.HOD, UserRole.DESIGNER, UserRole.SALESPERSON, UserRole.QS)
  getQsStatus(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.projectsService.getQsStatus(id, user.sub, user.role);
  }

  @Patch(':id/qs-status')
  @Roles(UserRole.HOD, UserRole.QS)
  updateQsStatus(@Param('id') id: string, @CurrentUser() user: JwtPayload, @Body() dto: UpdateQsStatusDto) {
    return this.projectsService.updateQsStatus(id, dto, user.sub, user.role);
  }

  @Post(':id/qs-submit')
  @Roles(UserRole.HOD, UserRole.QS)
  submitQsUpdate(@Param('id') id: string, @CurrentUser() user: JwtPayload, @Body() dto: SaveSignRowsDto) {
    return this.projectsService.submitQsUpdate(id, dto, user.sub, user.role);
  }
}
