/** Merge server-fetched posts with optimistic rows not yet visible in scoped queries. */
export function mergeChatterPostLists<
  T extends { id: string; taskId?: string | null; projectId?: string | null; createdAt?: string },
>(
  fetched: T[],
  previous: T[],
  scope?: { taskId?: string | null; projectId?: string | null },
): T[] {
  const byId = new Map(fetched.map((p) => [p.id, p]));
  for (const row of previous) {
    if (byId.has(row.id)) continue;
    const scoped = scope?.taskId
      ? row.taskId === scope.taskId
      : scope?.projectId
        ? row.projectId === scope.projectId || !row.taskId
        : true;
    if (scoped) byId.set(row.id, row);
  }
  return [...byId.values()].sort(
    (a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime(),
  );
}
