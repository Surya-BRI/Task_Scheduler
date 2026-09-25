/** Loose UUID check for SQL Server uniqueidentifier string literals (request/task/project ids). */
export function isUuidString(value: string | undefined | null): boolean {
  if (value == null) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

export function isPositiveIntegerString(value: string | undefined | null): boolean {
  if (value == null) return false;
  return /^\d+$/.test(value.trim());
}
