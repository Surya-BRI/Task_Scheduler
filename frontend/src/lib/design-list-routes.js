/**
 * Centralized paths for design-list records, project-design hub, and task flows.
 * Record `id` is the design-list row key (same as used in DesignListContext).
 */

export const FROM_PROJECT_DESIGN = "project-design";
export const FROM_PROJECTS_LIST = "projects-list";
export const FROM_DESIGN_LIST = "design-list";
export const FROM_DESIGNER_QUEUE = "designer-queue";
export const FROM_DESIGN_SCHEDULER = "design-scheduler";
export const FROM_SALES_QUEUE = "sales-queue";
export const FROM_SALES_DESIGN_LIST = "sales-design-list";
export const FROM_SALES_PROJECTS_LIST = "sales-projects-list";
export const FROM_SALES_PROJECT_DESIGN = "sales-project-design";

/** @param {string | null | undefined} from */
export function isProjectsListWorkflow(from) {
  return from === FROM_PROJECTS_LIST || from === FROM_SALES_PROJECTS_LIST;
}

/**
 * Resolve the list/hub route to return to after viewing a task or record.
 * @param {string | null | undefined} from
 * @returns {string}
 */
/**
 * Resolve back navigation for task detail pages.
 * @param {string | null | undefined} from
 * @param {string | null | undefined} backOverride
 * @returns {string}
 */
export function resolveTaskBackPath(from, backOverride) {
  if (backOverride && String(backOverride).startsWith("/")) {
    return backOverride;
  }
  return resolveWorkflowBackPath(from);
}

export function resolveWorkflowBackPath(from) {
  switch (from) {
    case FROM_PROJECT_DESIGN:
      return "/project-design";
    case FROM_PROJECTS_LIST:
      return "/projects-list";
    case FROM_SALES_PROJECT_DESIGN:
      return "/sales/project-design";
    case FROM_SALES_PROJECTS_LIST:
      return "/sales/projects-list";
    case FROM_SALES_DESIGN_LIST:
      return "/sales/design-list";
    case FROM_SALES_QUEUE:
      return "/sales/tasks";
    case "qs":
      return "/qs/projects";
    case FROM_DESIGN_SCHEDULER:
      return "/design-scheduler";
    case FROM_DESIGNER_QUEUE:
    case "designer-design-list":
    case "alex-design-list":
      return "/design-list/tasks";
    case FROM_DESIGN_LIST:
    default:
      return "/design-list";
  }
}

/**
 * @param {unknown} value
 * @returns {"retail" | "project" | "unknown"}
 */
export function normalizeDesignType(value) {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "retail" || v === "rtl" || v === "r") return "retail";
  if (v === "project" || v === "normal") return "project";
  return "unknown";
}

function buildPath(basePath, recordId, query) {
  const safeId = encodeURIComponent(String(recordId));
  const sp = new URLSearchParams();
  if (query && typeof query === "object") {
    for (const [k, v] of Object.entries(query)) {
      if (v == null || v === "") continue;
      sp.set(k, String(v));
    }
  }
  const qs = sp.toString();
  return qs ? `${basePath}/${safeId}?${qs}` : `${basePath}/${safeId}`;
}

/** @param {string|number} taskId design-list record id */
export function taskSummaryPath(taskId, query = {}) {
  return buildPath("/task-summary", taskId, query);
}

/** @param {string|number} recordId */
export function retailTaskCreationPath(recordId, query = {}) {
  return buildPath("/retail-task-creation", recordId, query);
}

/** @param {string|number} recordId */
export function projectTaskCreationPath(recordId, query = {}) {
  return buildPath("/project-task-creation", recordId, query);
}

/** @param {string|number} recordId */
export function retailTaskViewPath(recordId, query = {}) {
  return buildPath("/retail-task-view", recordId, query);
}

/** @param {string|number} recordId */
export function projectTaskViewPath(recordId, query = {}) {
  return buildPath("/project-task-view", recordId, query);
}

/**
 * Task view URL by record type (Retail vs Project).
 * @param {{ id?: string, designType?: string, category?: string } | null | undefined} record
 * @param {Record<string, string>} [query]
 * @returns {string}
 */
export function taskViewPathForRecord(record, query = {}) {
  const id = record?.id;
  if (id == null || String(id).trim() === "") {
    return "/design-list";
  }
  const kind = normalizeDesignType(record?.designType ?? record?.category);
  if (kind === "retail") return retailTaskViewPath(id, query);
  if (kind === "project") return projectTaskViewPath(id, query);
  return projectTaskViewPath(id, query);
}

/**
 * Task creation URL by record type (Retail vs Project).
 * Unknown type → project path + console warning (caller may also toast).
 * @param {{ id?: string, designType?: string, category?: string } | null | undefined} record
 * @param {Record<string, string>} [query]
 * @returns {string}
 */
export function taskCreationPathForRecord(record, query = {}) {
  const id = record?.id;
  if (id == null || String(id).trim() === "") {
    return "/project-design";
  }
  const kind = normalizeDesignType(record?.designType ?? record?.category);
  if (kind === "retail") return retailTaskCreationPath(id, query);
  if (kind === "project") return projectTaskCreationPath(id, query);
  if (typeof console !== "undefined" && console.warn) {
    console.warn("[design-list-routes] Unknown designType; using project task creation.", {
      id,
      designType: record?.designType,
      category: record?.category,
    });
  }
  return projectTaskCreationPath(id, query);
}
