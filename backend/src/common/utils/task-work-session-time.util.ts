/** Elapsed seconds for a draft session, including an in-progress run anchor. */
export function effectiveWorkSessionSeconds(
  durationSeconds: number,
  runStartedAt: Date | null | undefined,
  now: Date = new Date(),
): number {
  const base = Number.isFinite(durationSeconds) ? Math.max(0, Math.floor(durationSeconds)) : 0;
  if (!runStartedAt) return base;
  const elapsed = Math.max(0, Math.floor((now.getTime() - runStartedAt.getTime()) / 1000));
  return base + elapsed;
}

/** Exact whole seconds (non-negative). */
export function normalizeWorkSeconds(seconds: number): number {
  const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return safe;
}

/** Decimal hours for scheduler cards (2 dp) from exact logged seconds. */
export function workedHoursFromSeconds(seconds: number): number {
  const exact = normalizeWorkSeconds(seconds);
  if (exact <= 0) return 0;
  return Math.round((exact / 3600) * 100) / 100;
}
