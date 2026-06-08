/**
 * Integration tests for leave validations, edit, and cancel.
 * Usage: node scripts/verify-leave-validations.mjs
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
  return { ok: res.ok, status: res.status, data, text };
}

const DATE_OFFSET = 400 + (Date.now() % 90);

function futureDate(daysAhead) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + DATE_OFFSET + daysAhead);
  return d.toISOString().slice(0, 10);
}

function pastDate(daysAgo) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const designer = await login('alex.johnson@bluerhine.com', 'alex123');
  const hod = await login('sarah.mitchell@bluerhine.com', 'hod123');
  const designerId = designer.user?.id ?? designer.user?.sub;
  console.log('✓ Logged in');

  // Past date
  const past = await api(designer.token, '/requests', {
    method: 'POST',
    body: JSON.stringify({
      userId: designerId,
      type: 'Leave',
      startDate: pastDate(5),
      reason: 'Past',
    }),
  });
  assert(past.status === 400, `Past date should 400, got ${past.status}`);
  console.log('✓ Past dates rejected');

  // End before start
  const inverted = await api(designer.token, '/requests', {
    method: 'POST',
    body: JSON.stringify({
      userId: designerId,
      type: 'Leave',
      startDate: futureDate(50),
      endDate: futureDate(45),
      reason: 'Inverted',
    }),
  });
  assert(inverted.status === 400, `Inverted range should 400, got ${inverted.status}`);
  console.log('✓ End before start rejected');

  // Missing reason
  const noReason = await api(designer.token, '/requests', {
    method: 'POST',
    body: JSON.stringify({
      userId: designerId,
      type: 'Leave',
      startDate: futureDate(55),
    }),
  });
  assert(noReason.status === 400, `Missing reason should 400, got ${noReason.status}`);
  console.log('✓ Missing reason rejected');

  // Overlap
  const base = futureDate(200);
  const first = await api(designer.token, '/requests', {
    method: 'POST',
    body: JSON.stringify({
      userId: designerId,
      type: 'Leave',
      startDate: base,
      endDate: futureDate(202),
      reason: 'Overlap base',
    }),
  });
  assert(first.ok, `First create failed: ${first.text}`);
  const overlap = await api(designer.token, '/requests', {
    method: 'POST',
    body: JSON.stringify({
      userId: designerId,
      type: 'Leave',
      startDate: futureDate(201),
      endDate: futureDate(203),
      reason: 'Overlap attempt',
    }),
  });
  assert(overlap.status === 400, `Overlap should 400, got ${overlap.status}`);
  console.log('✓ Overlapping leave rejected');

  // Edit pending
  const updated = await api(designer.token, `/requests/${first.data.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ reason: 'Updated overlap base reason' }),
  });
  assert(updated.ok && updated.data.reason === 'Updated overlap base reason', 'Edit failed');
  console.log('✓ Pending leave edited');

  // Cancel pending
  const created = await api(designer.token, '/requests', {
    method: 'POST',
    body: JSON.stringify({
      userId: designerId,
      type: 'Leave',
      startDate: futureDate(210),
      reason: 'To cancel',
    }),
  });
  assert(created.ok, created.text);
  const cancelled = await api(designer.token, `/requests/${created.data.id}/cancel`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  assert(cancelled.ok && String(cancelled.data.status).toUpperCase() === 'CANCELLED', 'Cancel failed');
  console.log('✓ Pending leave cancelled');

  // HOD cannot review cancelled
  const reviewCancelled = await api(hod.token, `/requests/${created.data.id}/review`, {
    method: 'POST',
    body: JSON.stringify({ status: 'APPROVED' }),
  });
  assert(reviewCancelled.status === 400, 'Review cancelled should fail');
  console.log('✓ Cancelled leave cannot be reviewed');

  // Approved cannot cancel
  const forApprove = await api(designer.token, '/requests', {
    method: 'POST',
    body: JSON.stringify({
      userId: designerId,
      type: 'Leave',
      startDate: futureDate(220),
      reason: 'Approve then cancel test',
    }),
  });
  await api(hod.token, `/requests/${forApprove.data.id}/review`, {
    method: 'POST',
    body: JSON.stringify({ status: 'APPROVED' }),
  });
  const cancelApproved = await api(designer.token, `/requests/${forApprove.data.id}/cancel`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  assert(cancelApproved.status === 400, 'Cancel approved should 400');
  console.log('✓ Approved leave cannot be cancelled');

  // Core workflow still works
  const wf = await api(designer.token, '/requests', {
    method: 'POST',
    body: JSON.stringify({
      userId: designerId,
      type: 'Leave',
      startDate: futureDate(230),
      reason: 'Regression check',
    }),
  });
  const hodNotifs = await api(hod.token, '/notifications?limit=20');
  assert(
    hodNotifs.data?.some((n) => n.linkUrl?.includes(wf.data.id)),
    'HOD notification missing after create',
  );
  const approved = await api(hod.token, `/requests/${wf.data.id}/review`, {
    method: 'POST',
    body: JSON.stringify({ status: 'APPROVED' }),
  });
  assert(approved.ok, 'Approval regression failed');
  console.log('✓ Core submit → notify → approve regression passed');

  console.log('\nAll leave validation integration tests passed.');
}

main().catch((err) => {
  console.error('\n✗', err.message);
  process.exit(1);
});
