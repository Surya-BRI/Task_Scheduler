/**
 * Smoke test for Designer → HOD leave approval workflow.
 * Usage: node scripts/verify-leave-workflow.mjs
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

const DATE_OFFSET = 500 + (Date.now() % 90);

function futureDate(daysAhead) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + DATE_OFFSET + daysAhead);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const designer = await login('alex.johnson@bluerhine.com', 'alex123');
  const hod = await login('sarah.mitchell@bluerhine.com', 'hod123');
  console.log('✓ Designer and HOD login OK');

  const designerId = designer.user?.id ?? designer.user?.sub;
  assert(designerId, 'Designer id missing from login response');

  const startDate = futureDate(30);
  const endDate = futureDate(31);

  const created = await api(designer.token, '/requests', {
    method: 'POST',
    body: JSON.stringify({
      userId: designerId,
      type: 'Leave',
      reason: 'Smoke test leave',
      startDate,
      endDate,
    }),
  });
  assert(created?.id, 'Create should return id');
  assert(String(created.status).toUpperCase() === 'PENDING', `Expected PENDING, got ${created.status}`);
  console.log(`✓ Designer submitted leave request ${created.id}`);

  try {
    await api(hod.token, '/requests', {
      method: 'POST',
      body: JSON.stringify({
        userId: hod.user?.id ?? hod.user?.sub,
        type: 'Leave',
        reason: 'HOD should not submit',
        startDate,
        endDate,
      }),
    });
    throw new Error('HOD submit should fail');
  } catch (err) {
    assert(String(err.message).includes('403'), 'HOD must not be allowed to submit leave');
  }
  console.log('✓ HOD cannot submit leave requests');

  const pending = await api(hod.token, '/requests/pending-approvals');
  assert(
    pending.some((r) => r.id === created.id),
    'HOD pending inbox should include new request',
  );
  console.log('✓ HOD pending-approvals includes request');

  const hodNotifications = await api(hod.token, '/notifications?limit=30');
  assert(
    hodNotifications.some((n) => n.title === 'New Leave Request' && n.linkUrl?.includes(created.id)),
    'HOD should receive submission notification with deep link',
  );
  console.log('✓ HOD notification created on submission');

  const approved = await api(hod.token, `/requests/${created.id}/review`, {
    method: 'POST',
    body: JSON.stringify({ status: 'APPROVED' }),
  });
  assert(String(approved.status).toUpperCase() === 'APPROVED', `Expected APPROVED, got ${approved.status}`);
  assert(approved.approverName, 'Should include approver name');
  assert(approved.reviewedAt, 'Should include reviewedAt');
  console.log('✓ HOD approved request');

  const designerNotifications = await api(designer.token, '/notifications?limit=30');
  assert(
    designerNotifications.some(
      (n) => n.title === 'Leave Request Approved' && n.message?.toLowerCase().includes('approved'),
    ),
    'Designer should receive approval notification',
  );
  console.log('✓ Designer notified of approval');

  try {
    await api(hod.token, `/requests/${created.id}/review`, {
      method: 'POST',
      body: JSON.stringify({ status: 'APPROVED' }),
    });
    throw new Error('Duplicate approval should fail');
  } catch (err) {
    assert(String(err.message).includes('already'), 'Duplicate approval must be blocked');
  }
  console.log('✓ Duplicate approval blocked');

  const rejectStart = futureDate(45);
  const rejectEnd = futureDate(46);
  const rejectReq = await api(designer.token, '/requests', {
    method: 'POST',
    body: JSON.stringify({
      userId: designerId,
      type: 'Leave',
      reason: 'Reject smoke test',
      startDate: rejectStart,
      endDate: rejectEnd,
    }),
  });

  const rejected = await api(hod.token, `/requests/${rejectReq.id}/review`, {
    method: 'POST',
    body: JSON.stringify({ status: 'REJECTED', remarks: 'Not enough coverage' }),
  });
  assert(String(rejected.status).toUpperCase() === 'REJECTED', `Expected REJECTED, got ${rejected.status}`);
  assert(rejected.approverRemarks === 'Not enough coverage', 'Should store rejection remarks');
  console.log('✓ HOD rejected request');

  const designerRejectNotifications = await api(designer.token, '/notifications?limit=30');
  assert(
    designerRejectNotifications.some(
      (n) => n.title === 'Leave Request Rejected' && n.message?.toLowerCase().includes('rejected'),
    ),
    'Designer should receive rejection notification',
  );
  console.log('✓ Designer notified of rejection');

  console.log('\nAll leave workflow smoke tests passed.');
}

main().catch((err) => {
  console.error('\n✗ Test failed:', err.message);
  process.exit(1);
});
