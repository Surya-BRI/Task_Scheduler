import { Prisma } from '@prisma/client';

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Returns a trimmed UUID when valid; otherwise null. */
export function optionalUuid(value?: string | null): string | null {
  if (!value?.trim()) return null;
  const trimmed = value.trim();
  return UUID_RE.test(trimmed) ? trimmed : null;
}

/** Deduplicated list of validated UUID strings. */
export function filterValidUuids(ids: string[]): string[] {
  return [...new Set(ids.map((id) => optionalUuid(id)).filter(Boolean) as string[])];
}

/** Wraps a search term for parameterized SQL LIKE comparisons. */
export function likeContainsPattern(value: string): string {
  return `%${value}%`;
}

/** Parses a user-supplied date string; rejects unparseable values. */
export function parseOptionalSqlDate(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

/** Builds `AND fragment1 AND fragment2 ...` for optional filter clauses. */
export function buildAndWhere(fragments: Prisma.Sql[]): Prisma.Sql {
  if (fragments.length === 0) return Prisma.empty;
  return Prisma.sql`AND ${Prisma.join(fragments, ' AND ')}`;
}

/** Builds `WHERE fragment1 AND fragment2 ...`. */
export function buildWhere(fragments: Prisma.Sql[]): Prisma.Sql {
  if (fragments.length === 0) return Prisma.empty;
  return Prisma.sql`WHERE ${Prisma.join(fragments, ' AND ')}`;
}
