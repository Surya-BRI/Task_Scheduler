/**
 * Smoke test for regularization HOD approval workflow.
 * Usage: node scripts/verify-regularization-workflow.mjs
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

async function main() {
  const designer = await login('alex.johnson@bluerhine.com', 'alex123');
  const hod = await login('sarah.mitchell@bluerhine.com', 'hod123');
  console.log('✓ Designer and HOD login OK');

  const tasks = await api(designer.token, '/tasks?limit=5');
  const taskList = Array.isArray(tasks) ? tasks : tasks?.data ?? [];
  assert(taskList.length > 0, 'Need at least one task');
  const taskId = String(taskList[0].id);
  const designerId = designer.user?.id ?? designer.user?.sub;
  assert(designerId, 'Designer id missing from login response');

  const created = await api(designer.token, '/regularization-requests', {
    method: 'POST',
    body: JSON.stringify({
      designerId,
      taskId,
      date: new Date().toISOString().slice(0, 10),
      duration: '30 mins',
      reason: 'System Issue',
      status: 'Pending',
    }),
  });
  assert(created?.id, 'Create should return id');
  assert(created.status === 'Pending', `Expected Pending, got ${created.status}`);
  console.log(`✓ Created regularization request ${created.id}`);

  const pending = await api(hod.token, '/regularization-requests/pending-approvals');
  assert(
    pending.some((r) => r.id === created.id),
    'HOD pending inbox should include new request',
  );
  assert(pending[0]?.designerName, 'Pending item should include designerName');
  console.log('✓ HOD pending-approvals includes request with employee metadata');

  const notifications = await api(hod.token, '/notifications?limit=20');
  assert(
    notifications.some((n) => n.linkUrl?.includes(created.id)),
    'HOD should receive notification with deep link',
  );
  console.log('✓ HOD notification created with deep link');

  const approved = await api(hod.token, `/regularization-requests/${created.id}/review`, {
    method: 'POST',
    body: JSON.stringify({ status: 'Approved', remarks: 'Approved via smoke test' }),
  });
  assert(approved.status === 'Approved', `Expected Approved, got ${approved.status}`);
  assert(approved.approverRemarks, 'Should store approver remarks');
  assert(approved.reviewedAt, 'Should store reviewedAt');
  console.log('✓ HOD approved request');

  const designerNotifications = await api(designer.token, '/notifications?limit=20');
  assert(
    designerNotifications.some((n) => n.message?.toLowerCase().includes('approved')),
    'Designer should receive approval notification',
  );
  console.log('✓ Designer notified of approval');

  try {
    await api(hod.token, `/regularization-requests/${created.id}/review`, {
      method: 'POST',
      body: JSON.stringify({ status: 'Approved' }),
    });
    throw new Error('Duplicate approval should fail');
  } catch (err) {
    assert(String(err.message).includes('already been processed'), 'Duplicate approval must be blocked');
  }
  console.log('✓ Duplicate approval blocked');

  console.log('\nAll regularization workflow smoke tests passed.');
}

main().catch((err) => {
  console.error('\n✗ Test failed:', err.message);
  process.exit(1);
});
