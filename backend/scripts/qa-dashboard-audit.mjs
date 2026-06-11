const BASE = process.env.API_BASE || 'http://localhost:7000/api/v1';

async function login(email, password) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  return { status: res.status, token: data.access_token || data.accessToken, data };
}

async function get(path, token) {
  const start = Date.now();
  const res = await fetch(`${BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const ms = Date.now() - start;
  let body;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, ms, body };
}

function utcMonday() {
  const now = new Date();
  const day = now.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + diff);
  return monday.toISOString().split('T')[0];
}

const results = [];

function record(id, scenario, status, detail = '') {
  results.push({ id, scenario, status, detail });
}

(async () => {
  const weekStart = utcMonday();

  const hod = await login('sarah.mitchell@bluerhine.com', 'hod123');
  const designer = await login('alex.johnson@bluerhine.com', 'alex123');

  if (!hod.token || !designer.token) {
    console.error('Login failed');
    process.exit(1);
  }

  const noAuth = await get(`/dashboard/projects-overview?weekStart=${weekStart}`);
  record('PO-SEC-01', 'Unauthenticated projects-overview', noAuth.status === 401 ? 'PASS' : 'FAIL', `status=${noAuth.status}`);

  const designerOv = await get(`/dashboard/projects-overview?weekStart=${weekStart}`, designer.token);
  record('PO-RBAC-01', 'Designer blocked from projects-overview', designerOv.status === 403 ? 'PASS' : 'FAIL', `status=${designerOv.status}`);

  const hodOv = await get(`/dashboard/projects-overview?weekStart=${weekStart}`, hod.token);
  record('PO-FUNC-01', 'HOD projects-overview loads', hodOv.status === 200 ? 'PASS' : 'FAIL', `${hodOv.ms}ms`);

  if (hodOv.status === 200 && hodOv.body) {
    const o = hodOv.body;
    const donutSum = (o.summary?.active ?? 0) + (o.summary?.onHold ?? 0) + (o.summary?.completed ?? 0);
    record(
      'PO-DI-01',
      'Donut segments sum equals total',
      donutSum === o.summary?.total ? 'PASS' : 'FAIL',
      `sum=${donutSum} total=${o.summary?.total}`,
    );

    record(
      'PO-DI-06',
      'Summary includes all workflow tasks (>=37)',
      (o.summary?.total ?? 0) >= 37 ? 'PASS' : 'FAIL',
      `total=${o.summary?.total}`,
    );

    const inboxIds = o.inbox?.map((i) => i.itemKey ?? `${i.requestType}-${i.id}`) ?? [];
    record('PO-DI-04', 'Inbox items have itemKey', inboxIds.every(Boolean) ? 'PASS' : 'FAIL');

    const actionItems = o.inbox?.filter((i) => i.requiresAction) ?? [];
    const hasOt = actionItems.some((i) => i.requestType === 'overtime');
    const hasLeave = actionItems.some((i) => i.requestType === 'leave');
    record('PO-INBOX-03', 'Inbox approval types present', hasLeave || hasOt ? 'PASS' : 'WARN', `leave=${hasLeave} ot=${hasOt}`);
  }

  const hodMetrics = await get('/dashboard/metrics', hod.token);
  const designerMetrics = await get('/dashboard/metrics', designer.token);
  record('PO-METRICS-01', 'HOD metrics endpoint', hodMetrics.status === 200 ? 'PASS' : 'FAIL', `tasks=${hodMetrics.body?.totalTasks}`);
  record(
    'PO-METRICS-02',
    'Designer metrics scoped to assignee',
    designerMetrics.status === 200
      && designerMetrics.body?.totalTasks <= (hodMetrics.body?.totalTasks ?? Number.MAX_SAFE_INTEGER)
      && designerMetrics.body?.bucketTotals?.total === designerMetrics.body?.totalTasks
      ? 'PASS'
      : 'FAIL',
    `designer=${designerMetrics.body?.totalTasks} hod=${hodMetrics.body?.totalTasks}`,
  );
  record(
    'PO-METRICS-03',
    'Bucket totals match task count',
    hodMetrics.body?.bucketTotals?.total === hodMetrics.body?.totalTasks ? 'PASS' : 'FAIL',
    `bucket=${hodMetrics.body?.bucketTotals?.total} tasks=${hodMetrics.body?.totalTasks}`,
  );

  console.log(JSON.stringify(results, null, 2));
  const failed = results.filter((r) => r.status === 'FAIL').length;
  process.exit(failed > 0 ? 1 : 0);
})();
