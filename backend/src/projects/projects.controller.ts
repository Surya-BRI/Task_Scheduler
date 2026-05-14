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
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
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
  @Roles(UserRole.HOD, UserRole.ADMIN)
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateProjectDto) {
    return this.projectsService.create(user.sub, dto);
  }

  /** GET /projects?status=ACTIVE&category=Retail&search=abc&page=1&limit=20 */
  @Get()
  @Roles(UserRole.HOD, UserRole.DESIGNER, UserRole.ADMIN, UserRole.PROJECT_MANAGER)
  findAll(
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query('search') search?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit = 50,
  ) {
    return this.projectsService.findAll({ status, category, search, page, limit });
  }

  /** GET /projects/:id — returns project with its tasks */
  @Get(':id')
  @Roles(UserRole.HOD, UserRole.DESIGNER, UserRole.ADMIN, UserRole.PROJECT_MANAGER)
  findOne(@Param('id') id: string) {
    return this.projectsService.findOne(id);
  }

  /** PATCH /projects/:id — HOD/Admin */
  @Patch(':id')
  @Roles(UserRole.HOD, UserRole.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.projectsService.update(id, dto);
  }

  /** DELETE /projects/:id — Admin only */
  @Delete(':id')
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.projectsService.remove(id);
  }
}
