const toHours = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

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
      toHours(line?.asBuiltHours) +
      toHours(line?.productionReleaseHours),
    0,
  );
  if (projectHours > 0) return projectHours;

  return toHours(task?.estimatedHours);
}
