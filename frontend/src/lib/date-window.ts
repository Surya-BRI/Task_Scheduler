export function utcDateOnlyString(d = new Date()): string {
  return d.toISOString().split('T')[0];
}

export function minRegularizationDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 2);
  return utcDateOnlyString(d);
}

export function maxRegularizationDate(): string {
  return utcDateOnlyString();
}

export function isRegularizationDateAllowed(dateStr: string): boolean {
  if (!dateStr) return false;
  return dateStr >= minRegularizationDate() && dateStr <= maxRegularizationDate();
}

export function isOvertimeDateAllowed(dateStr: string): boolean {
  return dateStr === utcDateOnlyString();
}

export const LEAVE_REASON_OPTIONS = [
  'Sick Leave',
  'Personal Work',
  'Emergency',
  'Family Function',
  'Vacation',
  'Medical Appointment',
  'Work From Home',
  'Other',
] as const;
