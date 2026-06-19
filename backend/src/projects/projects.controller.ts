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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { CreateProjectFileLinkDto } from './dto/create-project-file-link.dto';
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
  @Roles(UserRole.HOD)
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateProjectDto) {
    return this.projectsService.create(user.sub, dto);
  }

  /** GET /projects?status=ACTIVE&category=Retail&search=abc&page=1&limit=20 */
  @Get()
  @Roles(UserRole.HOD, UserRole.DESIGNER, UserRole.SALESPERSON)
  findAll(
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query('search') search?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit = 50,
  ) {
    return this.projectsService.findAll({ status, category, search, page, limit });
  }

  /** GET /projects/by-project-no/:projectNo */
  @Get('by-project-no/:projectNo')
  @Roles(UserRole.HOD, UserRole.DESIGNER, UserRole.SALESPERSON)
  findByProjectNo(@Param('projectNo') projectNo: string) {
    return this.projectsService.findByProjectNo(projectNo);
  }

  /** GET /projects/:id — returns project with its tasks */
  @Get(':id')
  @Roles(UserRole.HOD, UserRole.DESIGNER, UserRole.SALESPERSON)
  findOne(@Param('id') id: string) {
    return this.projectsService.findOne(id);
  }

  @Post(':id/files')
  @Roles(UserRole.HOD)
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
  @Roles(UserRole.HOD)
  addFileLink(
    @Param('id') id: string,
    @Body() dto: CreateProjectFileLinkDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.projectsService.addProjectFileLink(id, dto, user.sub);
  }

  @Get(':id/files')
  @Roles(UserRole.HOD, UserRole.DESIGNER, UserRole.SALESPERSON)
  getFiles(@Param('id') id: string) {
    return this.projectsService.getProjectFiles(id);
  }

  @Delete(':id/files/:fileId')
  @Roles(UserRole.HOD)
  removeFile(@Param('id') id: string, @Param('fileId') fileId: string, @CurrentUser() user: JwtPayload) {
    return this.projectsService.removeProjectFile(id, fileId, user.sub);
  }

  /** PATCH /projects/:id — HOD/Admin */
  @Patch(':id')
  @Roles(UserRole.HOD)
  update(@Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.projectsService.update(id, dto);
  }

  /** DELETE /projects/:id — Admin only */
  @Delete(':id')
  @Roles(UserRole.HOD)
  remove(@Param('id') id: string) {
    return this.projectsService.remove(id);
  }
}
