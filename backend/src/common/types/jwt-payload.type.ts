import type { UserRole } from '../constants/roles.enum';

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
}
