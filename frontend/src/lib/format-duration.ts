export function toPositiveHours(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/** Durations under 1h show as minutes (e.g. 0.17h → "10m"); 1h+ as "3h" or "1h 10m". */
export function formatHoursAsHm(hours: unknown): string {
  const totalMinutes = Math.round(toPositiveHours(hours) * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

export type SchedulerHoursPart = {
  designerId: string;
  designerName: string;
  hours: number;
  assignedHours?: number;
  loggedHours?: number;
  overAssignedHours?: number;
  sliceCount?: number;
};

export type SchedulerHoursSummary = {
  totalHours: number;
  totalAssignedHours?: number;
  totalLoggedHours?: number;
  myHours: number | null;
  myAssignedHours?: number | null;
  myLoggedHours?: number | null;
  myOverAssignedHours?: number | null;
  parts: SchedulerHoursPart[];
};

export function formatSchedulerAssignedHours(
  summary: SchedulerHoursSummary | null | undefined,
  options: { isHod?: boolean; viewerUserId?: string | null } = {},
): string | null {
  if (!summary) return null;
  const { isHod = false, viewerUserId } = options;

  if (!isHod && viewerUserId) {
    const mine = summary.parts.find((p) => p.designerId === viewerUserId);
    if (mine && mine.hours > 0) return formatHoursAsHm(mine.hours);
  }

  if (summary.parts.length > 0) {
    if (summary.parts.length === 1) return formatHoursAsHm(summary.parts[0].hours);
    return summary.parts
      .filter((p) => p.hours > 0)
      .map((p) => `${formatHoursAsHm(p.hours)} (${p.designerName})`)
      .join(', ');
  }

  if (summary.totalHours > 0) return formatHoursAsHm(summary.totalHours);
  return null;
}

export function resolveSchedulerHoursForViewer(
  summary: SchedulerHoursSummary | null | undefined,
  viewerUserId?: string | null,
): number {
  if (!summary) return 0;
  if (viewerUserId) {
    const mine = summary.parts.find((p) => p.designerId === viewerUserId);
    if (mine && mine.hours > 0) return mine.hours;
  }
  return summary.totalHours > 0 ? summary.totalHours : 0;
}
