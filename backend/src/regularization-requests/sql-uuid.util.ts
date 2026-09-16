/** Loose UUID check for SQL Server uniqueidentifier string literals (request/task/project ids). */
export function isUuidString(value: string | undefined | null): boolean {
  if (value == null) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

/** User ids (designerId/approverId/etc.) now point at ErpUser.userId, a bigint —
 * validate a positive integer string instead of a GUID. */
export function isPositiveIntegerString(value: string | undefined | null): boolean {
  if (value == null) return false;
  return /^\d+$/.test(value.trim());
}
