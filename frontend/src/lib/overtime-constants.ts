export const MAX_OVERTIME_HOURS_PER_DAY = 8;

export const OVERTIME_REQUESTED_HOURS_OPTIONS = Array.from({ length: MAX_OVERTIME_HOURS_PER_DAY }, (_, i) => {
  const n = i + 1;
  return `${n} hour${n === 1 ? '' : 's'}`;
});

export function parseRequestedHoursLabel(label: string): number {
  const m = /^(\d+(?:\.\d+)?)/.exec(String(label ?? '').trim());
  if (!m) return 0;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : 0;
}
