/**
 * Verify HOD sees all designer leaves on the same day and duplicate designer leaves are blocked.
 * Usage: node scripts/verify-hod-calendar-leaves.mjs
 */
const BASE = process.env.API_BASE_URL || 'http://127.0.0.1:7000/api/v1';
const DUPLICATE_LEAVE_ERROR_MESSAGE =
  'You already have a leave request for the selected date(s). Please modify or cancel the existing request instead of creating a duplicate.';
const DATE_OFFSET = 800 + Math.floor(Math.random() * 500);

function futureDate(daysAhead) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + DATE_OFFSET + daysAhead);
  return d.toISOString().slice(0, 10);
}

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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function parseMessage(text) {
  try {
    const parsed = JSON.parse(text);
    return parsed?.message?.message ?? parsed?.message ?? text;
  } catch {
    return text;
  }
}

async function main() {
  const designer1 = await login('alex.johnson@bluerhine.com', 'alex123');
  const designer2 = await login('alexander.allen@bluerhine.com', 'alex123');
  const hod = await login('sarah.mitchell@bluerhine.com', 'hod123');

  const d1 = designer1.user?.id ?? designer1.user?.sub;
  const d2 = designer2.user?.id ?? designer2.user?.sub;
  const sharedDate = futureDate(0);

  const leave1 = await api(designer1.token, '/requests', {
    method: 'POST',
    body: JSON.stringify({
      userId: d1,
      type: 'Leave',
      startDate: sharedDate,
      endDate: sharedDate,
      reason: 'Designer 1 shared day',
    }),
  });
  assert(leave1.ok, `Designer1 create failed: ${leave1.text}`);

  const leave2 = await api(designer2.token, '/requests', {
    method: 'POST',
    body: JSON.stringify({
      userId: d2,
      type: 'Half Day',
      halfDaySession: 'First Half',
      startDate: sharedDate,
      endDate: sharedDate,
      reason: 'Designer 2 shared day',
    }),
  });
  assert(leave2.ok, `Designer2 create failed: ${leave2.text}`);
  console.log(`✓ Two designers created leave on ${sharedDate}`);

  const team = await api(hod.token, '/requests/team-requests');
  assert(team.ok, team.text);
  const onDay = team.data.filter((r) => r.fromDate === sharedDate || r.toDate === sharedDate);
  assert(
    onDay.some((r) => r.id === leave1.data.id) && onDay.some((r) => r.id === leave2.data.id),
    'HOD team-requests must include both designers on the same day',
  );
  console.log(`✓ HOD team-requests returns ${onDay.length} leave(s) for ${sharedDate}`);

  const dup = await api(designer1.token, '/requests', {
    method: 'POST',
    body: JSON.stringify({
      userId: d1,
      type: 'Leave',
      startDate: sharedDate,
      endDate: sharedDate,
      reason: 'Duplicate attempt',
    }),
  });
  assert(dup.status === 400, 'Duplicate designer leave should be rejected');
  const dupMsg = String(parseMessage(dup.text));
  assert(dupMsg.includes(DUPLICATE_LEAVE_ERROR_MESSAGE), `Expected duplicate message, got: ${dupMsg}`);
  console.log('✓ Duplicate designer leave blocked with standard message');

  const rangeStart = sharedDate;
  const rangeEnd = futureDate(2);
  const partialOverlap = await api(designer1.token, '/requests', {
    method: 'POST',
    body: JSON.stringify({
      userId: d1,
      type: 'Leave',
      startDate: rangeStart,
      endDate: rangeEnd,
      reason: 'Should overlap existing single day',
    }),
  });
  assert(partialOverlap.status === 400, 'Overlapping multi-day range should be rejected');
  console.log('✓ Overlapping date range blocked for same designer');

  console.log('\nAll HOD calendar / duplicate leave tests passed.');
}

main().catch((err) => {
  console.error('\n✗', err.message);
  process.exit(1);
});
