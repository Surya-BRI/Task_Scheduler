const normalize = (value) => String(value ?? "").trim().toLowerCase();

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

export function isDesignerEligibleForProject(designerFullName, project) {
  const teamNames = parseTeamNameSet(project);
  if (teamNames.size === 0) return true;
  return teamNames.has(normalize(designerFullName));
}
