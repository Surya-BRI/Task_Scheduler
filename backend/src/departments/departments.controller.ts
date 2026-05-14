import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { DepartmentsService } from './departments.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/constants/roles.enum';

@Controller('departments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  /** POST /departments — Admin/HOD only */
  @Post()
  @Roles(UserRole.HOD, UserRole.ADMIN)
  create(@Body() dto: CreateDepartmentDto) {
    return this.departmentsService.create(dto);
  }

  /** GET /departments — authenticated */
  @Get()
  findAll() {
    return this.departmentsService.findAll();
  }

  /** GET /departments/:id — authenticated */
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.departmentsService.findOne(id);
  }

  /** PATCH /departments/:id — Admin/HOD only */
  @Patch(':id')
  @Roles(UserRole.HOD, UserRole.ADMIN)
  update(@Param('id') id: string, @Body() dto: CreateDepartmentDto) {
    return this.departmentsService.update(id, dto);
  }

  /** DELETE /departments/:id — Admin only */
  @Delete(':id')
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.departmentsService.remove(id);
  }
}
