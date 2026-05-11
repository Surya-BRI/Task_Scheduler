export function parseDesignListDate(value) {
  if (!value || typeof value !== 'string') return null;

  const parts = value.split('/').map(Number);
  if (parts.length !== 3 || parts.some((p) => Number.isNaN(p))) return null;

  const [a, b, year] = parts;
  if (!a || !b || !year) return null;

  // Prefer DD/MM/YYYY for this module, but accept MM/DD/YYYY fallback.
  const day = a > 12 ? a : b > 12 ? b : a;
  const month = a > 12 ? b : b > 12 ? a : b;
  const parsed = new Date(year, month - 1, day);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

