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

/** Keep one row per comment id (case-insensitive UUID). */
export function dedupeCommentsById<T extends { id?: string | null }>(
  comments: T[] | null | undefined,
): T[] {
  const byId = new Map<string, T>();
  for (const comment of comments ?? []) {
    const raw = comment?.id;
    if (raw == null) continue;
    const key = String(raw).trim().toLowerCase();
    if (!key) continue;
    byId.set(key, comment);
  }
  return [...byId.values()];
}
