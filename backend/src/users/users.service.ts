import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '../common/constants/roles.enum';

// ERP roleName -> Scheduler role bucket. ERP has dozens of granular roles; only
// the ones with a real Scheduler equivalent can log into the Scheduler app.
const ERP_ROLE_MAP: Record<string, UserRole> = {
  'Design HOD': UserRole.HOD,
  'Design Head': UserRole.HOD,
  Admin: UserRole.HOD,
  'Sub Admin': UserRole.HOD,
  SalesRep: UserRole.SALESPERSON,
  'Sales Coordinator': UserRole.SALESPERSON,
  Designer: UserRole.DESIGNER,
  QS: UserRole.QS,
};

type ErpAuthRow = { userId: bigint; userName: string; password: string; roleName: string };
type ErpUserRow = { userId: bigint; userName: string; roleName: string | null };

export type ErpLoginResult = { userId: bigint; userName: string; role: UserRole };

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Validates a login directly against ERP's own auth tables
   * (ErpAuthUsers/ErpAuthUserRoleMap/ErpMasterRole). Returns null if the
   * account doesn't exist, the password doesn't match, or its ERP role has
   * no Scheduler equivalent. No local shadow account is created — the
   * returned userId IS the identity used everywhere else in the app.
   */
  async validateErpLogin(userName: string, password: string): Promise<ErpLoginResult | null> {
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

    return { userId: erpUser.userId, userName: erpUser.userName, role: mappedRole };
  }

  async findAll(filters?: { role?: string; search?: string }) {
    const rows = await this.prisma.$queryRaw<ErpUserRow[]>`
      SELECT u.userId, u.userName, r.roleName
      FROM ErpAuthUsers u
      LEFT JOIN ErpAuthUserRoleMap m ON m.userId = u.userId AND m.isActive = 1
      LEFT JOIN ErpMasterRole r ON r.roleId = m.roleId AND r.isActive = 1 AND r.isDeleted = 0
      WHERE u.isActive = 1 AND u.isDeleted = 0
      ORDER BY u.userName ASC
    `;

    return rows
      .map((row) => ({
        id: row.userId.toString(),
        userName: row.userName,
        role: row.roleName ? (ERP_ROLE_MAP[row.roleName] ?? null) : null,
      }))
      .filter((user) => {
        if (filters?.role && user.role !== filters.role) return false;
        if (filters?.search && !user.userName.toLowerCase().includes(filters.search.toLowerCase())) return false;
        return true;
      });
  }

  async findById(id: string) {
    const userId = BigInt(id);
    const rows = await this.prisma.$queryRaw<ErpUserRow[]>`
      SELECT TOP 1 u.userId, u.userName, r.roleName
      FROM ErpAuthUsers u
      LEFT JOIN ErpAuthUserRoleMap m ON m.userId = u.userId AND m.isActive = 1
      LEFT JOIN ErpMasterRole r ON r.roleId = m.roleId AND r.isActive = 1 AND r.isDeleted = 0
      WHERE u.userId = ${userId}
    `;
    const user = rows[0];
    if (!user) throw new NotFoundException('User not found');
    return {
      id: user.userId.toString(),
      userName: user.userName,
      role: user.roleName ? (ERP_ROLE_MAP[user.roleName] ?? null) : null,
    };
  }

  async findByIdForViewer(id: string, viewerId: string, viewerRole: UserRole | string) {
    const privilegedRoles = new Set<string>([UserRole.HOD, UserRole.ADMIN, UserRole.PROJECT_MANAGER]);
    if (BigInt(viewerId) !== BigInt(id) && !privilegedRoles.has(String(viewerRole))) {
      throw new ForbiddenException('You can only view your own profile');
    }
    return this.findById(id);
  }
}
