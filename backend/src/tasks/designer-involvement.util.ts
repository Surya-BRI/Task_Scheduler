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
