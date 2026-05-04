const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export { MONTH_LABELS };

/** @param {number} ms */
export function formatRelative(ms, now = Date.now()) {
  const delta = Math.max(0, Math.floor((now - ms) / 1000));
  if (delta < 60) return `${delta || 1} second${delta === 1 ? "" : "s"} ago`;
  const m = Math.floor(delta / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  if (d < 14) return `${d} day${d === 1 ? "" : "s"} ago`;
  return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/** @typedef {{ startDate: string, endDate: string }} DateRange */

/**
 * @param {string} iso
 * @param {DateRange | null} range
 */
export function isInMonthYearRange(iso, range) {
  if (!range?.startDate && !range?.endDate) return true;
  const t = new Date(iso).getTime();
  const start = range?.startDate ? new Date(`${range.startDate}T00:00:00`).getTime() : null;
  const end = range?.endDate ? new Date(`${range.endDate}T23:59:59.999`).getTime() : null;
  if (start !== null && t < start) return false;
  if (end !== null && t > end) return false;
  return true;
}

export function filterActivities(
  rows,
  {
    teammateMode,
    activityKind,
    sortMonthIndex,
    dateRange,
    timeOrder,
    priority = "all",
  },
) {
  let list = [...rows];

  if (teammateMode === "individuals") {
    list = list.filter((r) => r.individualEligible);
  }

  if (activityKind === "task_update") {
    list = list.filter((r) => r.kind === "task_update");
  } else if (activityKind === "project_milestone") {
    list = list.filter((r) => r.kind === "project_milestone");
  }

  if (sortMonthIndex !== "all") {
    list = list.filter((r) => r.monthIndex === sortMonthIndex);
  }

  if (priority !== "all") {
    list = list.filter((r) => (r.priority ?? "normal") === priority);
  }

  list = list.filter((r) => isInMonthYearRange(r.occurredAt, dateRange));

  list.sort((a, b) => {
    const ta = new Date(a.occurredAt).getTime();
    const tb = new Date(b.occurredAt).getTime();
    return timeOrder === "latest" ? tb - ta : ta - tb;
  });

  return list;
}
