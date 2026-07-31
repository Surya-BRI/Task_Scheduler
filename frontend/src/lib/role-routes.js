/**
 * Role-based app paths for leave planner and requests.
 * HOD uses /hod/*; designers keep /designer/*.
 */

export function isHodRole(role) {
  return String(role ?? "").toUpperCase() === "HOD";
}

function withSearchAndHash(base, search = "", hash = "") {
  const q = String(search ?? "").replace(/^\?/, "");
  const h = String(hash ?? "").replace(/^#/, "");
  return `${base}${q ? `?${q}` : ""}${h ? `#${h}` : ""}`;
}

/** @param {string | null | undefined} role */
export function leavePlannerPath(role, search = "", hash = "") {
  const base = isHodRole(role) ? "/hod/leave-planner" : "/designer/leave-planner";
  return withSearchAndHash(base, search, hash);
}

/** @param {string | null | undefined} role */
export function requestsPath(role, search = "", hash = "") {
  const base = isHodRole(role) ? "/hod/requests" : "/designer/requests";
  return withSearchAndHash(base, search, hash);
}

/**
 * Preserve current query/hash when switching prefix by role.
 * @param {string} pathname
 * @param {string | null | undefined} role
 * @param {string} [search]
 * @param {string} [hash]
 */
export function leaveOrRequestsPathForRole(pathname, role, search = "", hash = "") {
  const path = String(pathname ?? "");
  if (path.includes("leave-planner")) return leavePlannerPath(role, search, hash);
  if (path.includes("requests")) return requestsPath(role, search, hash);
  return path;
}
