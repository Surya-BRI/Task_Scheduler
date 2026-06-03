/**
 * Smoke test for Chatter module fixes (task scoping, titles, mentions, filters).
 * Usage: node scripts/verify-chatter-fixes.mjs
 */
const BASE = process.env.API_BASE_URL || 'http://127.0.0.1:7000/api/v1';

async function login() {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'sarah.mitchell@bluerhine.com',
      password: 'hod123',
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Login ${res.status}: ${text}`);
  return JSON.parse(text).accessToken;
}

async function api(token, path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) throw new Error(`${options.method ?? 'GET'} ${path} ${res.status}: ${text}`);
  return data;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const token = await login();
  console.log('✓ Login OK');

  const users = await api(token, '/chatter-posts/mention-users');
  assert(Array.isArray(users) && users.length > 0, 'mention-users should return users');
  const mentionTarget = users.find((u) => u.id) ?? users[0];
  console.log(`✓ Mention users (${users.length}), target: ${mentionTarget.fullName}`);

  const tasksRes = await api(token, '/tasks?limit=5');
  const tasks = Array.isArray(tasksRes) ? tasksRes : tasksRes?.data ?? [];
  assert(tasks.length > 0, 'Need at least one task for task-scoped tests');
  const task = tasks[0];
  const taskId = String(task.id);
  console.log(`✓ Using task ${taskId} (${task.title ?? task.taskNo ?? 'unnamed'})`);

  const created = await api(token, '/chatter-posts', {
    method: 'POST',
    body: JSON.stringify({
      message: `E2E chatter fix test ${Date.now()}`,
      postType: 'Posts',
      taskId,
      mentionUserId: mentionTarget.id,
    }),
  });
  assert(created?.id, 'Post create should return id');
  assert(created.taskId === taskId, 'Created post should retain taskId');
  assert(created.taskName, 'Created post should include taskName');
  assert(
    created.title && created.title.toLowerCase() !== 'chatter post',
    `Title should be task name, got: ${created.title}`,
  );
  assert(created.mentionUserId === mentionTarget.id, 'Post mentionUserId should persist');
  console.log(`✓ Post created with title "${created.title}" taskName="${created.taskName}"`);

  const byTask = await api(token, `/chatter-posts?taskId=${encodeURIComponent(taskId)}&limit=50`);
  assert(
    byTask.some((p) => p.id === created.id),
    'Task-scoped list should include newly created post immediately',
  );
  console.log('✓ Task-scoped fetch includes new post');

  const byMention = await api(token, `/chatter-posts?mentionUserId=${encodeURIComponent(mentionTarget.id)}&limit=50`);
  assert(
    byMention.some((p) => p.id === created.id),
    'Mention filter should include post where user is mentioned',
  );
  console.log('✓ Mention filter includes post mention');

  const comment = await api(token, `/chatter-posts/${encodeURIComponent(created.id)}/comments`, {
    method: 'POST',
    body: JSON.stringify({
      message: `E2E comment mention ${Date.now()}`,
      mentionUserId: mentionTarget.id,
    }),
  });
  assert(comment?.id, 'Comment create should return id');
  assert(comment.mentionUserId === mentionTarget.id, 'Comment mentionUserId should persist');
  assert(comment.authorName, 'Comment should include author join');
  console.log('✓ Comment created with mention and author metadata');

  const byMentionAfterComment = await api(
    token,
    `/chatter-posts?mentionUserId=${encodeURIComponent(mentionTarget.id)}&limit=50`,
  );
  assert(
    byMentionAfterComment.some((p) => p.id === created.id),
    'Mention filter should still include post after comment mention',
  );
  const postWithComment = byMentionAfterComment.find((p) => p.id === created.id);
  assert(
    (postWithComment?.comments ?? []).some((c) => c.id === comment.id),
    'Post in mention filter should include nested comments',
  );
  console.log('✓ Mention filter works for comment mentions');

  const byCommenter = await api(token, `/chatter-posts?commentedByUserId=${encodeURIComponent(created.authorId)}&limit=50`);
  assert(
    byCommenter.some((p) => p.id === created.id),
    'commentedByUserId filter should include post with user comment',
  );
  console.log('✓ commentedByUserId filter works');

  console.log('\nAll chatter fix smoke tests passed.');
}

main().catch((err) => {
  console.error('\n✗ Test failed:', err.message);
  process.exit(1);
});
