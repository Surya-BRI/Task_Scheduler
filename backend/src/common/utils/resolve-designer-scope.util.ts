import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '../constants/roles.enum';

/**
 * Ensures non-HOD users can only access their own designer-scoped data.
 * HOD callers may pass an explicit designerId (e.g. team views).
 */
export function resolveDesignerScope(
  requestedDesignerId: string | undefined,
  callerId: string,
  callerRole: UserRole | string,
): string {
  const trimmed = requestedDesignerId?.trim();
  const effectiveId = trimmed || callerId;
  if (!effectiveId) {
    return '';
  }
  if (callerRole !== UserRole.HOD && effectiveId !== callerId) {
    throw new ForbiddenException('You can only access your own designer data.');
  }
  return effectiveId;
}
