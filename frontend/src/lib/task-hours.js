const toHours = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

/**
 * Required hours for a task. `retailDetails` and `projectDetails` are ARRAYS of
 * detail lines in every API response (list and by-id) — never plain objects.
 * Project lines carry hours per discipline (only the task's own discipline is set).
 */
export function getTaskRequiredHours(task) {
  const retailLines = Array.isArray(task?.retailDetails) ? task.retailDetails : [];
  const retailHours = retailLines.reduce((sum, line) => sum + toHours(line?.hoursRequired), 0);
  if (retailHours > 0) return retailHours;

  const projectLines = Array.isArray(task?.projectDetails) ? task.projectDetails : [];
  const projectHours = projectLines.reduce(
    (sum, line) =>
      sum +
      toHours(line?.artworkHours) +
      toHours(line?.technicalHours) +
      toHours(line?.locationHours) +
      toHours(line?.asBuiltHours),
    0,
  );
  if (projectHours > 0) return projectHours;

  return toHours(task?.estimatedHours);
}
