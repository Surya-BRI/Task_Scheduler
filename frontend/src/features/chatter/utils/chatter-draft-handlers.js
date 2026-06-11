/**
 * Stable state updaters for embedded chatter composers (avoid render loops).
 */
export function updateCommentDraft(prev, postId, text) {
  if ((prev[postId] ?? '') === text) return prev;
  return { ...prev, [postId]: text };
}

export function updateCommentMentionIds(prev, postId, ids) {
  const nextKey = (ids ?? []).join(',');
  const prevKey = (prev[postId] ?? []).join(',');
  if (nextKey === prevKey) return prev;
  return { ...prev, [postId]: ids };
}

export function updateMentionIdList(prev, ids) {
  const nextKey = (ids ?? []).join(',');
  const prevKey = (prev ?? []).join(',');
  if (nextKey === prevKey) return prev;
  return ids;
}
