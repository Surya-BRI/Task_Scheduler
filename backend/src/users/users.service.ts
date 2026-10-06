import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '../common/constants/roles.enum';
import { ERP_ROLE_MAP } from '../common/utils/erp-role-map.util';
import { hasHodEquivalentAccess, isBackupHodReviewer } from '../common/utils/workflow-roles.util';

type ErpAuthRow = { userId: bigint; userName: string; password: string; roleName: string };
type ErpUserRow = { userId: bigint; userName: string; roleName: string | null };
type ErpSalesRow = { userId: bigint; userName: string; firstName: string | null; lastName: string | null; roleName: string };

export type ErpLoginResult = { userId: bigint; userName: string; role: UserRole };

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

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
    if (filters?.role === UserRole.SALESPERSON) {
      const rows = await this.prisma.$queryRaw<ErpSalesRow[]>`
        SELECT E.userId, Au.userName, E.firstName, E.lastName, MR.roleName
        FROM ErpMasterEmployee E
        INNER JOIN ErpAuthUserRoleMap AURM ON E.userId = AURM.userId AND AURM.isActive = 1
        INNER JOIN ErpMasterRole MR ON AURM.roleId = MR.roleId AND MR.isActive = 1 AND MR.isDeleted = 0
        INNER JOIN ErpAuthUsers Au ON E.userId = Au.userId
        WHERE E.isActive = 1 AND E.isDeleted = 0 AND E.isAllowLogin = 1
          AND Au.isActive = 1 AND Au.isDeleted = 0
          AND MR.roleName IN ('SalesRep', 'Sales Coordinator', 'SalesManagerRetail', 'Director Of Retail')
          AND Au.userName NOT IN ('-', '')
        ORDER BY Au.userName ASC
      `;
      return rows
        .map((row) => ({
          id: row.userId.toString(),
          userName: row.userName,
          displayName: [row.firstName, row.lastName].filter(Boolean).join(' ') || row.userName,
          salesPersonName: `${row.firstName ?? ''}${row.lastName ?? ''}`.trim() || row.userName,
          role: ERP_ROLE_MAP[row.roleName] ?? UserRole.SALESPERSON,
          erpRole: row.roleName,
        }))
        .filter((user) => !filters.search || user.userName.toLowerCase().includes(filters.search.toLowerCase()));
    }

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
        if (filters?.role) {
          const matchesRole = user.role === filters.role;
          // Backup HOD reviewers stay real DESIGNERs (unaffected everywhere else) but also
          // surface in HOD listings — e.g. the task-creation reviewer/HOD pickers — so an HOD
          // can be designated up front to one of them too, not just Gopan/Tony.
          const matchesAsBackupReviewer =
            filters.role === UserRole.HOD &&
            user.role === UserRole.DESIGNER &&
            isBackupHodReviewer(user.id);
          if (!matchesRole && !matchesAsBackupReviewer) return false;
        }
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
    if (BigInt(viewerId) !== BigInt(id) && !hasHodEquivalentAccess(viewerRole) && String(viewerRole) !== UserRole.PROJECT_MANAGER) {
      throw new ForbiddenException('You can only view your own profile');
    }
    return this.findById(id);
  }
}
