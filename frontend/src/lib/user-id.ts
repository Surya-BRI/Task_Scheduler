// User ids are now ERP ErpAuthUsers.userId — decimal bigints, not GUIDs.
const NUMERIC_ID_RE = /^\d+$/;

export function normalizeUserId(value?: string | null): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed || !NUMERIC_ID_RE.test(trimmed)) return null;
  return trimmed;
}

export function isSameUserId(
  left?: string | null,
  right?: string | null,
): boolean {
  const a = normalizeUserId(left);
  const b = normalizeUserId(right);
  return Boolean(a && b && a === b);
}
