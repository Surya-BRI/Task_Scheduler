import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserRole } from '../common/constants/roles.enum';

const USER_SELECT = {
  id: true,
  email: true,
  fullName: true,
  departmentId: true,
  role: { select: { id: true, name: true } },
  department: { select: { id: true, name: true } },
  createdAt: true,
  updatedAt: true,
};

// ERP roleName -> Scheduler role bucket. ERP has dozens of granular roles; only
// the ones with a real Scheduler equivalent can bridge a login.
const ERP_ROLE_MAP: Record<string, UserRole> = {
  'Design HOD': UserRole.HOD,
  'Design Head': UserRole.HOD,
  SalesRep: UserRole.SALESPERSON,
  'Sales Coordinator': UserRole.SALESPERSON,
  Designer: UserRole.DESIGNER,
  QS: UserRole.QS,
};

type ErpAuthRow = { userId: bigint; userName: string; password: string; roleName: string };

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Bridges the ERP's own auth tables (ErpAuthUsers/ErpAuthUserRoleMap/ErpMasterRole)
   * into a Scheduler ErpTSUser: validates the password against ErpAuthUsers directly,
   * then finds or provisions the matching ErpTSUser so the rest of the app (tasks,
   * projects, etc., all keyed off ErpTSUser.id) works unchanged. Returns null if the
   * ERP account doesn't exist, the password doesn't match, or its role has no mapping.
   */
  async findOrCreateFromErpAuth(userName: string, password: string) {
    const rows = await this.prisma.$queryRaw<ErpAuthRow[]>`
      SELECT TOP 1 u.userId, u.userName, u.password, r.roleName
      FROM ErpAuthUsers u
      JOIN ErpAuthUserRoleMap m ON m.userId = u.userId AND m.isActive = 1
      JOIN ErpMasterRole r ON r.roleId = m.roleId AND r.isActive = 1 AND r.isDeleted = 0
      WHERE u.userName = ${userName} AND u.isActive = 1 AND u.isDeleted = 0
      ORDER BY m.mapId DESC
    `;
    const erpUser = rows[0];
    if (!erpUser) return null;

    const passwordMatches = await bcrypt.compare(password, erpUser.password);
    if (!passwordMatches) return null;

    const mappedRole = ERP_ROLE_MAP[erpUser.roleName];
    if (!mappedRole) return null;

    const role = await this.prisma.role.findUnique({ where: { name: mappedRole } });
    if (!role) return null;

    const bridgedEmail = `${erpUser.userName.toLowerCase()}@erp-dev.local`;
    const existing = await this.prisma.user.findUnique({
      where: { email: bridgedEmail },
      include: { role: true, department: true },
    });
    if (existing) return existing;

    const passwordHash = await bcrypt.hash(password, 10);
    return this.prisma.user.create({
      data: {
        email: bridgedEmail,
        fullName: erpUser.userName,
        passwordHash,
        roleId: role.id,
      },
      include: { role: true, department: true },
    });
  }

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('Email already exists');
    }

    const role = await this.prisma.role.findUnique({ where: { name: dto.role } });
    if (!role) {
      throw new NotFoundException(`Role '${dto.role}' not found`);
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    return this.prisma.user.create({
      data: {
        email: dto.email,
        fullName: dto.fullName,
        passwordHash,
        roleId: role.id,
        departmentId: dto.departmentId ?? null,
      },
      select: USER_SELECT,
    });
  }

  findAll(filters?: { role?: string; departmentId?: string; search?: string }) {
    const where: Record<string, unknown> = {};

    if (filters?.role) {
      where.role = { name: filters.role };
    }
    if (filters?.departmentId) {
      where.departmentId = filters.departmentId;
    }
    if (filters?.search) {
      where.OR = [
        { fullName: { contains: filters.search } },
        { email: { contains: filters.search } },
      ];
    }

    return this.prisma.user.findMany({
      where,
      select: USER_SELECT,
      orderBy: { fullName: 'asc' },
    });
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: USER_SELECT,
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findByIdForViewer(id: string, viewerId: string, viewerRole: UserRole | string) {
    const privilegedRoles = new Set<string>([UserRole.HOD, UserRole.ADMIN, UserRole.PROJECT_MANAGER]);
    if (viewerId !== id && !privilegedRoles.has(String(viewerRole))) {
      throw new ForbiddenException('You can only view your own profile');
    }
    return this.findById(id);
  }

  findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      include: { role: true, department: true },
    });
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findById(id); // throws NotFoundException if absent

    const data: Record<string, unknown> = {};

    if (dto.fullName) data.fullName = dto.fullName;
    if (dto.departmentId !== undefined) data.departmentId = dto.departmentId;
    if (dto.role) {
      const role = await this.prisma.role.findUnique({ where: { name: dto.role } });
      if (!role) throw new NotFoundException(`Role '${dto.role}' not found`);
      data.roleId = role.id;
    }
    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, 10);
    }

    return this.prisma.user.update({
      where: { id },
      data,
      select: USER_SELECT,
    });
  }

  async remove(id: string) {
    await this.findById(id);
    return this.prisma.user.delete({ where: { id } });
  }
}
