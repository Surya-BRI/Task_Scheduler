/**
 * Existing relationships that mean a Designer worked on or was involved in a task.
 * Used for list filtering and IDOR protection — no new join table.
 */
export function designerInvolvementWhere(userId: string) {
  return {
    OR: [
      { assigneeId: userId },
      { taskDesigners: { some: { designerId: userId } } },
      { schedulerAssignments: { some: { designerId: userId } } },
      { workSessions: { some: { designerId: userId } } },
    ],
  };
}

export function parseStatusList(raw?: string | null): string[] {
  if (!raw) return [];
  return [...new Set(
    raw
      .split(',')
      .map((value) => String(value ?? '').trim())
      .filter(Boolean),
  )];
}
