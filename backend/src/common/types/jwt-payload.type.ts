import type { UserRole } from '../constants/roles.enum';

export interface JwtPayload {
  /** ERP ErpAuthUsers.userId, as a decimal string (JWT `sub` is conventionally a string). */
  sub: string;
  username: string;
  role: UserRole;
}
