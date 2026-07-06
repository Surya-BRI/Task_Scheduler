const normalize = (value) => String(value ?? "").trim().toLowerCase();

/**
 * Builds the set of names eligible to receive tasks for a project's team
 * (technicalHead/teamLead/subTeamLead/designers). Mirrors the normalization
 * used by the backend's assertDesignerEligibleForProjectTeam so both sides
 * agree on edge cases (trim + lowercase, comma-split designers).
 */
export function parseTeamNameSet(project) {
  if (!project) return new Set();
  const names = [
    project.technicalHead,
    project.teamLead,
    project.subTeamLead,
    ...String(project.designers ?? "").split(","),
  ]
    .map(normalize)
    .filter(Boolean);
  return new Set(names);
}

/**
 * A project with no team configured at all (e.g. Retail-category projects,
 * which never expose the Team tab) is unrestricted — every designer is eligible.
 */
export function isDesignerEligibleForProject(designerFullName, project) {
  const teamNames = parseTeamNameSet(project);
  if (teamNames.size === 0) return true;
  return teamNames.has(normalize(designerFullName));
}
