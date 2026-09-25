import { ForbiddenException } from '@nestjs/common';
import { hasDepartmentManagerAccess } from './workflow-roles.util';

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
