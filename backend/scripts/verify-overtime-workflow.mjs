/**
 * Smoke test for overtime HOD approval workflow.
 * Usage: node scripts/verify-overtime-workflow.mjs
 */
const BASE = process.env.API_BASE_URL || 'http://127.0.0.1:7000/api/v1';

async function login(email, password) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Login ${email} ${res.status}: ${text}`);
  const data = JSON.parse(text);
  return { token: data.accessToken, user: data.user ?? data };
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
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${options.method ?? 'GET'} ${path} ${res.status}: ${text}`);
  return data;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function uniqueDateOffset(daysAhead = 14) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead + Math.floor(Math.random() * 30));
  return d.toISOString().slice(0, 10);
}

async function main() {
  const designer = await login('alex.johnson@bluerhine.com', 'alex123');
  const hod = await login('sarah.mitchell@bluerhine.com', 'hod123');
  console.log('✓ Designer and HOD login OK');

  const tasks = await api(designer.token, '/tasks?limit=10');
  const taskList = Array.isArray(tasks) ? tasks : tasks?.data ?? [];
  assert(taskList.length > 0, 'Need at least one assigned task for designer');
  const task = taskList[0];
  const taskId = String(task.id);
  const projectName = task.project?.name ?? task.projectName;
  assert(projectName, 'Task should include project name metadata');
  console.log(`✓ Assigned task: ${task.title || task.taskNo} (${projectName})`);

  const requestDate = uniqueDateOffset();
  const created = await api(designer.token, '/overtime-requests', {
    method: 'POST',
    body: JSON.stringify({
      taskId,
      date: requestDate,
      estimatedRemaining: '2 hours',
      requestedHours: '1 hour',
      reason: 'Urgent Delivery',
      status: 'Pending',
    }),
  });
  assert(created?.id, 'Create should return id');
  assert(created.status === 'SUBMITTED', `Expected SUBMITTED, got ${created.status}`);
  console.log(`✓ Created overtime request ${created.id} (status SUBMITTED)`);

  const history = await api(designer.token, '/overtime-requests');
  const row = history.find((r) => r.id === created.id);
  assert(row, 'Designer history should include new request');
  assert(row.projectName && row.projectName !== '—', 'History should show projectName');
  assert(row.taskTitle && row.taskTitle !== '—', 'History should show taskTitle');
  console.log(`✓ History shows ${row.projectName} / ${row.taskTitle}`);

  const pending = await api(hod.token, '/overtime-requests/pending-approvals');
  assert(
    pending.some((r) => r.id === created.id),
    'HOD pending inbox should include new request',
  );
  const pendingRow = pending.find((r) => r.id === created.id);
  assert(pendingRow?.designerName, 'Pending item should include designerName');
  assert(pendingRow?.projectName, 'Pending item should include projectName');
  assert(pendingRow?.taskTitle, 'Pending item should include taskTitle');
  console.log('✓ HOD pending-approvals includes request with project/task names');

  const notifications = await api(hod.token, '/notifications?limit=20');
  assert(
    notifications.some((n) => n.linkUrl?.includes(created.id)),
    'HOD should receive notification with deep link',
  );
  console.log('✓ HOD notification created with deep link');

  const approved = await api(hod.token, `/overtime-requests/${created.id}/review`, {
    method: 'POST',
    body: JSON.stringify({
      status: 'APPROVED_BY_MANAGER',
      comments: 'Approved via smoke test',
      approvedHours: '1 hour',
    }),
  });
  assert(approved.status === 'APPROVED_BY_MANAGER', `Expected APPROVED_BY_MANAGER, got ${approved.status}`);
  assert(Number(approved.approvedHours) === 1, 'Should parse approvedHours from label');
  console.log('✓ HOD approved request');

  const designerNotifications = await api(designer.token, '/notifications?limit=20');
  assert(
    designerNotifications.some((n) => n.message?.toLowerCase().includes('approved')),
    'Designer should receive approval notification',
  );
  console.log('✓ Designer notified of approval');

  try {
    await api(hod.token, `/overtime-requests/${created.id}/review`, {
      method: 'POST',
      body: JSON.stringify({ status: 'APPROVED_BY_MANAGER', comments: 'Again' }),
    });
    throw new Error('Duplicate approval should fail');
  } catch (err) {
    assert(String(err.message).includes('submittable state'), 'Duplicate approval must be blocked');
  }
  console.log('✓ Duplicate approval blocked');

  console.log('\nAll overtime workflow smoke tests passed.');
}

main().catch((err) => {
  console.error('\n✗ Test failed:', err.message);
  process.exit(1);
});
