/**
 * Resolve task/project context for mention user lookup on a chatter post.
 * Prefer the post's own linkage so comments behave consistently per post.
 */
export function resolveChatterMentionScope(
  entry,
  { taskId = null, projectId = null, taskIdReady = false } = {},
) {
  const postTaskId = entry?.taskId?.trim?.() ? entry.taskId : null;
  const postProjectId = entry?.projectId?.trim?.() ? entry.projectId : null;
  return {
    taskId: postTaskId || (taskIdReady && taskId ? taskId : null),
    projectId: postProjectId || projectId || null,
  };
}

/**
 * Page-level scope for new post composers (no post entry yet).
 */
export function resolvePageChatterMentionScope({ taskId = null, projectId = null, taskIdReady = false } = {}) {
  return {
    taskId: taskIdReady && taskId ? taskId : null,
    projectId: projectId || null,
  };
}
