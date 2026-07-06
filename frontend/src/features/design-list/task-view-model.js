export function formatDisplayDate(dateLike) {
  const date = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

export function normalizeStatusCode(rawStatus) {
  const value = String(rawStatus ?? "").trim().toUpperCase();
  // New lifecycle statuses — pass through
  if (value === "DESIGN_NEW")       return "DESIGN_NEW";
  if (value === "DESIGN_PLANNED")   return "DESIGN_PLANNED";
  if (value === "IN_PROGRESS")      return "IN_PROGRESS";
  if (value === "DESIGN_COMPLETED") return "DESIGN_COMPLETED";
  if (value === "HOD_REVIEW")       return "HOD_REVIEW";
  if (value === "SALES_REVIEW")     return "SALES_REVIEW";
  if (value === "REWORK")           return "REWORK";
  if (value === "CLIENT_ACCEPTED")  return "CLIENT_ACCEPTED";
  if (value === "CLIENT_REJECTED")  return "CLIENT_REJECTED";
  if (value === "ON_HOLD")          return "ON_HOLD";
  // Legacy → new lifecycle mapping
  if (value === "PENDING")   return "DESIGN_NEW";
  if (value === "WIP")       return "IN_PROGRESS";
  if (value === "REVISION")  return "REWORK";
  if (value === "COMPLETED") return "CLIENT_ACCEPTED";
  if (value === "APPROVED")  return "CLIENT_ACCEPTED";
  return "DESIGN_NEW";
}

/** Maps a frontend display status back to the legacy backend value for API filter calls. */
export function toBackendStatus(frontendStatus) {
  switch (String(frontendStatus ?? "").toUpperCase()) {
    case "DESIGN_NEW":       return "PENDING";
    case "IN_PROGRESS":      return "WIP";
    case "REWORK":           return "REVISION";
    case "CLIENT_ACCEPTED":  return "CLIENT_ACCEPTED";
    default:                 return frontendStatus;
  }
}

export function getStatusLabel(statusCode) {
  switch (normalizeStatusCode(statusCode)) {
    case "DESIGN_NEW":       return "Design Task New";
    case "DESIGN_PLANNED":   return "Design Planned";
    case "IN_PROGRESS":      return "In Progress";
    case "DESIGN_COMPLETED": return "Design Completed";
    case "HOD_REVIEW":       return "HOD Review";
    case "SALES_REVIEW":     return "Sales Review";
    case "REWORK":           return "Rework / Error";
    case "CLIENT_ACCEPTED":  return "Client Accepted";
    case "CLIENT_REJECTED":  return "Client Rejected";
    case "ON_HOLD":          return "On Hold";
    default:                 return "Design Task New";
  }
}

function toCreatedDate(task) {
  if (task?.createdAt instanceof Date && !Number.isNaN(task.createdAt.getTime())) return task.createdAt;
  return null;
}

function toDeadlineDate(task) {
  if (task?.dueDate instanceof Date && !Number.isNaN(task.dueDate.getTime())) return task.dueDate;
  return null;
}

export function computeAgingDays(submissionDate) {
  if (!(submissionDate instanceof Date) || Number.isNaN(submissionDate.getTime())) return 0;
  const now = new Date();
  const start = new Date(submissionDate);
  start.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  const diffMs = now.getTime() - start.getTime();
  return diffMs > 0 ? Math.floor(diffMs / 86400000) : 0;
}

export function mapTaskToDesignRow(task) {
  const createdDate = toCreatedDate(task);
  const deadlineDate = toDeadlineDate(task);
  return {
    id: task?.id,
    projectId: task?.projectId || task?.project?.id || null,
    opNo: task?.opNo || "—",
    projectNo: task?.project?.projectNo || "—",
    projectName: task?.project?.name || task?.project?.projectNo || "—",
    designType: task?.project?.category || "Project",
    businessUnit: task?.project?.category || "Project",
    name: [
      task?.opNo || task?.project?.projectNo || null,
      task?.signType || null,
      task?.disciplineType || null,
      task?.revisionCode || null,
    ].filter(Boolean).join(' - ') || "No ID",
    status: normalizeStatusCode(task?.status),
    salesPerson: task?.project?.salesPerson || "Unassigned",
    created: formatDisplayDate(createdDate) || "—",
    deadline: formatDisplayDate(deadlineDate) || "—",
    submissionDate: deadlineDate,
    agingDays: computeAgingDays(createdDate),
    assigneeId: task?.assigneeId || null,
    designerNames:
      task?.assignee?.fullName ||
      (task?.taskDesigners?.length > 0
        ? task.taskDesigners.map((d) => d.designer.fullName).join(', ')
        : null),
    revisionCode: task?.revisionCode || "—",
  };
}

export function matchDateRange(date, startDate, endDate) {
  if (!startDate && !endDate) return true;
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;
  const ts = date.getTime();
  if (startDate) {
    const start = new Date(`${startDate}T00:00:00`).getTime();
    if (ts < start) return false;
  }
  if (endDate) {
    const end = new Date(`${endDate}T23:59:59`).getTime();
    if (ts > end) return false;
  }
  return true;
}

