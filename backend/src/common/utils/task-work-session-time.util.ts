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

/** Round up to 5-minute buckets (matches designer timer). */
export function roundWorkSecondsUpTo5Min(seconds: number): number {
  const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  if (safe <= 0) return 0;
  return Math.ceil(safe / 300) * 300;
}

/** Decimal hours for scheduler cards (2 dp), after 5-minute round-up. */
export function workedHoursFromSeconds(seconds: number): number {
  const rounded = roundWorkSecondsUpTo5Min(seconds);
  if (rounded <= 0) return 0;
  return Math.round((rounded / 3600) * 100) / 100;
}
