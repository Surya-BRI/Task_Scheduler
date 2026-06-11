const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Normalize ERP user UUIDs for stable comparisons (case-insensitive). */
export function normalizeUserId(value?: string | null): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed || !UUID_RE.test(trimmed)) return null;
  return trimmed.toLowerCase();
}

export function isSameUserId(
  left?: string | null,
  right?: string | null,
): boolean {
  const a = normalizeUserId(left);
  const b = normalizeUserId(right);
  return Boolean(a && b && a === b);
}
