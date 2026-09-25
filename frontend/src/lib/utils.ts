export function cn(...classNames: Array<string | false | null | undefined>) {
  return classNames.filter(Boolean).join(' ');
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateForInput(value: Date | string | null | undefined): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function parseInputDate(value: string): Date | null {
  if (!value) return null;
  // Append T00:00:00 to avoid UTC-vs-local timezone shifts
  const d = new Date(`${value}T00:00:00`);
  return isNaN(d.getTime()) ? null : d;
}

/** ISO 8601 date-time regex used by the JSON reviver */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?$/;

export function dateReviver(_key: string, value: unknown): unknown {
  if (typeof value === 'string' && ISO_DATE_RE.test(value)) {
    const d = new Date(value);
    return isNaN(d.getTime()) ? value : d;
  }
  return value;
}
