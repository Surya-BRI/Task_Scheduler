/** UTC Monday (YYYY-MM-DD) for the week containing the given date. */
export function getUtcMondayOfDate(date: Date): string {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().split('T')[0];
}

/** Label for a UTC week range (Mon–Sun). */
export function formatUtcWeekLabel(weekStartIso: string): string {
  const monday = new Date(`${weekStartIso}T00:00:00.000Z`);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const fmt = (dt: Date) =>
    dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const year = sunday.getUTCFullYear();
  return `${fmt(monday)} — ${fmt(sunday)}, ${year}`;
}

/** Parse YYYY-MM-DD date picker value as UTC reference date. */
export function dateInputToUtcReference(isoDate: string): Date {
  return new Date(`${isoDate}T12:00:00.000Z`);
}
