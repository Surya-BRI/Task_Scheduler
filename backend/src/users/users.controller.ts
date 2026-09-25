import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
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

  /** GET /users?role=DESIGNER&search=john — HOD/Admin/PM */
  @Get()
  @Roles(UserRole.HOD, UserRole.ADMIN, UserRole.PROJECT_MANAGER, UserRole.SALESPERSON)
  findAll(@Query('role') role?: string, @Query('search') search?: string) {
    return this.usersService.findAll({ role, search });
  }

  /** GET /users/:id — self or privileged roles */
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.usersService.findByIdForViewer(id, user.sub, user.role);
  }
}
