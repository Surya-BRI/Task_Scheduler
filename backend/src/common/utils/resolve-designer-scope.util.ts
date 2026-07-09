import { ForbiddenException } from '@nestjs/common';
import { hasDepartmentManagerAccess } from './workflow-roles.util';

/**
 * Ensures non-manager users can only access their own designer-scoped data.
 * HOD / Sales callers may pass an explicit designerId (e.g. team views).
 */
export function resolveDesignerScope(
  requestedDesignerId: string | undefined,
  callerId: string,
  callerRole: string,
): string {
  const trimmed = requestedDesignerId?.trim();
  const effectiveId = trimmed || callerId;
  if (!effectiveId) {
    return '';
  }
  if (!hasDepartmentManagerAccess(callerRole) && effectiveId !== callerId) {
    throw new ForbiddenException('You can only access your own designer data.');
  }
  return effectiveId;
}
