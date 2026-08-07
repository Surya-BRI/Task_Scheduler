/** Rule 10 — project team name matching (trim + lower). */

export function normalizePersonName(value: string): string {
  return value.trim().toLowerCase();
}

export type ProjectTeamNameFields = {
  technicalHead?: string | null;
  teamLead?: string | null;
  subTeamLead?: string | null;
  designers?: string | null;
};

/**
 * Collect display names and normalized names from project team fields.
 * `designers` may be a comma-separated list.
 */
export function collectProjectTeamNames(project: ProjectTeamNameFields | null | undefined): {
  displayNames: Set<string>;
  normalized: Set<string>;
} {
  const raw = [
    project?.technicalHead,
    project?.teamLead,
    project?.subTeamLead,
    ...(project?.designers?.split(',') ?? []),
  ]
    .map((n) => (typeof n === 'string' ? n.trim() : ''))
    .filter(Boolean);

  return {
    displayNames: new Set(raw),
    normalized: new Set(raw.map(normalizePersonName)),
  };
}
