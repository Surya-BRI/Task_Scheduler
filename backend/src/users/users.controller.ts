import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/constants/roles.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/types/jwt-payload.type';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /** POST /users — HOD/Admin only */
  @Post()
  @Roles(UserRole.HOD)
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  /** GET /users?role=DESIGNER&departmentId=x&search=john — HOD/Admin/PM */
  @Get()
  @Roles(UserRole.HOD, UserRole.ADMIN, UserRole.PROJECT_MANAGER)
  findAll(
    @Query('role') role?: string,
    @Query('departmentId') departmentId?: string,
    @Query('search') search?: string,
  ) {
    return this.usersService.findAll({ role, departmentId, search });
  }

  /** GET /users/:id — self or privileged roles */
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.usersService.findByIdForViewer(id, user.sub, user.role);
  }

  /** PATCH /users/:id — HOD/Admin only */
  @Patch(':id')
  @Roles(UserRole.HOD)
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  /** DELETE /users/:id — Admin only */
  @Delete(':id')
  @Roles(UserRole.HOD)
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
