/** Loose UUID check for SQL Server uniqueidentifier string literals. */
export function isUuidString(value: string | undefined | null): boolean {
  if (value == null) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

export function escSqlNString(value: string): string {
  return value.replace(/'/g, "''");
}

/** Safe fragment: CONVERT(uniqueidentifier, N'…') */
export function sqlUniqueIdentifier(value: string): string {
  const t = value.trim();
  if (!isUuidString(t)) {
    throw new Error(`Invalid UUID: ${value}`);
  }
  return `CONVERT(uniqueidentifier, N'${escSqlNString(t)}')`;
}
