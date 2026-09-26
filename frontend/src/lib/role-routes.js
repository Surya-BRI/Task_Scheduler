
/**
 * HOD-level access: HOD plus ADMIN. Admin has every HOD permission but is a separate role —
 * it is only *not* an HOD for assignment (HOD pick lists / reviewer HOD), never for access.
 */
export function isHodRole(role) {
  const r = String(role ?? "").toUpperCase();
  return r === "HOD" || r === "ADMIN";
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

export function leaveOrRequestsPathForRole(pathname, role, search = "", hash = "") {
  const path = String(pathname ?? "");
  if (path.includes("leave-planner")) return leavePlannerPath(role, search, hash);
  if (path.includes("requests")) return requestsPath(role, search, hash);
  return path;
}
