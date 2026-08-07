# API Load & Efficiency Playbook

**Purpose:** Reduce load on the production API (`task-scheduler` on PM2) so more Designers and HODs can use the app concurrently without pool exhaustion or slow pages.

**Audience:** Engineers working the Task Scheduler monorepo.  
**Last updated:** 2026-08-07  

**Sources reviewed:**
- `HOD_PERFORMANCE_REPORT.md`, `AJ DESIGNER_PERF_REORT.md`, `SALES_QA_PERFORMANCE_REPORT_SUMMARY.md` (**historical QA baselines** — late July; many Critical rows are already fixed in tree)
- `backend/docs/RELIABILITY.md`, `DEVOPS.md`, `SCHEDULER_FIXES_NEEDED.md`, `KNOWN_GAPS.md`, `REALLOCATION_GAPS.md`, `DATABASE_ACCESS_PATTERNS.md`
- `DEPLOYMENT_RUNBOOK.md`, `backend/ecosystem.config.cjs`, `backend/src/prisma/prisma-pool.util.ts`
- Current frontend helpers: `frontend/src/lib/singleflight.ts`, `api-client` GET inflight, `realtime.ts` shared socket
- Code cross-check inventory: [Explore load/perf docs](f0a5a2d2-9ef8-4b75-bd8d-f84c922b5428)

> **Important:** Re-measure chatter, requests, overview, and activities after the fixes below before treating old QA “Critical” IDs as still open.

---

## 1. Production topology (why this matters)

| Fact | Value | Implication |
|------|--------|-------------|
| PM2 app | `task-scheduler` (fork mode) | **One** Nest Node process |
| Instances | `1` (`ecosystem.config.cjs`) | No horizontal Node scaling today |
| Prisma pool | `DB_CONNECTION_LIMIT` default **30** | Concurrent queries share ~30 SQL connections |
| Pool wait | `DB_POOL_TIMEOUT` default **30s** | Then P2024 / timeouts under stampede |
| Cron | Soft-skips when pool busy | Good — but user traffic still competes |

**Rough concurrent comfort on this box** (engineering estimate, not a load-test certificate):

| Mix | Expectation |
|-----|-------------|
| ~30–50 designers (mostly light) + 1–2 HODs | Comfortable |
| Several HODs on design-scheduler / projects-overview at once | First stress point |

**Rule of thumb:** Cutting duplicate and oversized HOD/list fetches buys more headroom than adding PM2 instances (each instance multiplies pool pressure on SQL Server).

---

## 2. Goals

1. **Fewer HTTP calls per page open** (especially Critical/High duplicates).
2. **Smaller payloads** and **paginated lists** instead of `limit=500`.
3. **Shorter / fewer DB round-trips** on hot endpoints (batch N+1, slim selects).
4. **Realtime deltas instead of full refetch** where payloads already exist.
5. **Defer non-critical chrome** (notifications) until after primary UI paints.
6. Keep **one shared WebSocket**; avoid `ws-token` storms.

---

## 3. Already fixed vs still open

### 3a. Already in place — do not re-open

| Capability | Where | Notes |
|------------|--------|------|
| GET singleflight at HTTP client | `frontend/src/lib/api-client.ts` | Same path coalesces |
| Named singleflight | `frontend/src/lib/singleflight.ts` | overview, scheduler-queue, activities, chatter pieces, DESIGNER users |
| Shared Socket.IO + ws-token cache | `frontend/src/lib/realtime.ts` | Fixes dual-socket QA findings |
| Deferred notifications | `Navbar` idle / delayed fetch | Off critical path (improved) |
| Scheduler queue API | `GET /tasks/scheduler-queue` | Replaced HOD `tasks?limit=500` sidebar |
| Realtime deltas | `DashboardRefreshPayload` | weekStart, changedTaskIds, … |
| Batched `submittedDurationSeconds` | `tasks.service.ts` + `ProjectTaskTimer` | **DT-01/02 fixed** — no list N+1 |
| Skip unused ERP `/design-list` on task lists | `DesignListContext.shouldLoadDesignList` | **DT-03 / D2 / SD-02 fixed** |
| Design-list / sales queue page size **100** | Frontend `PAGE_SIZE` | **D4 / DT-05 / SQ-01 / SD-01 fixed** |
| Debounced search (design list, projects, sales, QS) | Various screens | **P3 / D5 largely fixed** |
| Requests: no `projects?limit=500`; HOD-only designer list | `RequestsClient.jsx` | **OT-01 / DO-01 etc. fixed** |
| Activities poll 20s → **90s** + singleflight | Team activity | **TA-01 mitigated; DTA-02 partially** |
| Overview section take caps (~40) | `dashboard.service.ts` | Softens PO-08 |
| Incremental week save + no-op skip | Scheduler | Pool-friendly |
| History retention cron | `SCHEDULER_HISTORY_RETENTION_MONTHS` | |
| Reallocation #1–3 | Atomic freeze, 6-week pack + warn toast, pending unique | `REALLOCATION_GAPS.md` |
| Retry / circuit breaker / cron soft-skip | Reliability docs | |

### 3b. Still open — prioritize these

| Item | Why it still matters | Primary touchpoints |
|------|----------------------|---------------------|
| Scheduler week **grid** payload/DOM | Dense board (sidebar already virtualized + DTO slimmed) | assignments mapper, scheduler grid UI |
| Overflow into locked weeks | Correctness + wasted writes | `placeOverflowCapacity` |
| Single PM2 fork + pool 30 | Hard ceiling | ops — only after code wins |

### 3c. Landed in efficiency sprint 2026-08-07 (2→1→3→4)

| Item | Status |
|------|--------|
| Requests tab-scoped OT/Reg/Realloc | **Done** (already gated; HOD designers `singleflight`) |
| Chatter `/seen` local + refresh narrowing | **Done** — debounce + postId merge; no self-emit on create/comment |
| Reallocation `mapWithRemaining` N+1 | **Done** — `groupBy` `_sum` |
| Projects-overview cost | **Mitigated** — parallel inbox, shared dept lookup, 20s TTL cache, WS debounce 1.5s |

### 3d. Landed in efficiency sprint 2026-08-07 (1→3→4)

| Item | Status |
|------|--------|
| Team activity slim + delta | **Done** — cold `limit=40`, `since` deltas, no 90s full poll when WS up, slim task include, `{ data, pageInfo }` |
| ERP project-design hub | **Done** — paginated `?page&limit&type&q&fields=hub`; bare GET no longer pulls 500 |
| `listEligibleDesigners` team-first | **Done** — `collectProjectTeamNames` + name-scoped `findMany` |

### 3e. Landed in efficiency sprint 2026-08-07 (scheduler sidebar + sales history)

| Item | Status |
|------|--------|
| Scheduler sidebar virtualize | **Already done** — `VirtualScrollList` on backlog |
| Scheduler queue / embed DTO slim | **Done** — dropped always-null `signType`/`revisionCode`/`phase`/team stubs |
| Sales history `take` 500–1000 | **Done** — `SELECT DISTINCT taskId` (no activity take cap); Task `skip`/`limit` unchanged |
| Designer dashboard ~30s poll | **Done** — WS-first; 3 min backup only when socket down; visibility/focus refresh kept |
| Leave planner poll + team history | **Done** — full team history already tab-lazy; WS-first; 3 min backup when socket down (was unconditional 90s) |

---

## 4. Cross-cutting themes

### A. Duplicate fetches

QA (July) saw 2×–4× GETs. **Many mitigated** via singleflight; residual risk remains on remount/`setPage` races and chatter `/seen`.

**Playbook:**
1. Heavy GETs → `apiClient.get` or `singleflight(stableKey, …)` with query in the key.
2. One bootstrap owner per screen (avoid layout + page both loading the same list).
3. Re-verify Network on cold open after each change — do not trust old QA rows alone.

**Status of former hot offenders:**

| ID | Symptom | Status now |
|----|---------|------------|
| DS-01, DS-02 | queue / designers ×2 | **Mitigated** (singleflight) — re-verify |
| PO-01 | overview ×2 | **Mitigated** (singleflight) — re-verify callers |
| CH-01–03 | chatter multi-fetch / seen reload | **Mitigated** — `/seen` local; debounced refresh + merge |
| TA-01 | activities ×2 | **Mitigated**; slim + delta done (2026-08-07) |
| DT-01–03 | submitted-session N+1; unused design-list | **Fixed** |
| D4 / SQ-01 | limit=500 lists | **Fixed** (page 100); history backend cap still open |

### B. Over-fetch / pagination

| Area | Status | Remaining target |
|------|--------|------------------|
| Design list / sales queue | Page size 100 done | Keep discipline; no regressions to 500 |
| Sales history backend id lookup | **Done** — distinct task ids, no take 500–1000 | Keep FE page/limit; optional composite index later |
| Activities `limit=100` | **Done** — cold 40 + `since` delta; slim select | Keep WS-first; no full replace on poll |
| Dashboard / week tasks | Partial | Week-scoped summaries where possible |

### C. N+1 and chatty lists

| Pattern | Status |
|---------|--------|
| Per-row `submitted-session` on lists | **Fixed** — use `initialSubmittedSeconds` |
| Reallocation `mapWithRemaining` | **Fixed** — batched `groupBy` `_sum` |
| `listEligibleDesigners` full user scan | **Fixed** — team-first name query |

### D. Heavy backend endpoints (pool eaters)

| Endpoint | Why expensive | Mitigation |
|----------|---------------|------------|
| `GET /dashboard/projects-overview` | Many parallel finds | **Mitigated** — TTL cache + parallel inbox; keep FE singleflight |
| `GET /scheduler-assignments` (week) | Tens of KB | Slim embed DTO **done**; grid virtualize still open |
| `GET /tasks/scheduler-queue` | Full backlog (by design) | Slim select + sidebar virtualize **done** |
| `PUT` week save | Long txn (up to ~30s) | Incremental + no-op skip (done) |
| Reallocation handoff | Up to ~60s txn | Freeze-in-txn done; batch split updates still open |
| ERP `design-list` | Huge join | Skip on task lists (done); hub paginate + `fields=hub` **done** |

### E. WebSocket / polling

| Issue | Status / fix |
|-------|----------------|
| Dual sockets | **Fixed** — shared `realtime.ts` |
| Activities 20s poll | **Improved** — 90s backup only when WS down; deltas via `since` |
| Chatter refetch vs WS | Finish local patch; stop `/seen` full reload |
| Designer dashboard / leave / requests polls | Dashboard + leave **done** (WS-first); requests already tab-scoped |

### F. Critical-path chrome

Notifications deferred via idle callback — **improved**. Still prefer deriving unread from one payload long-term.

---

## 5. Priority roadmap (codebase side)

Work top-down. Each phase should reduce concurrent DB usage on the single PM2 worker.

### Phase 0 — Measure (1 day)

- [ ] Cold-open Network waterfall for: design-scheduler, projects-overview, design-list (HOD + designer), chatter, sales/tasks.
- [ ] Record: unique URLs, duplicate count, largest payloads, time-to-interactive.
- [ ] Confirm prod: `pm2 show`, `DB_CONNECTION_LIMIT`, `NODE_ENV`.
- [ ] Optional: `k6` against authenticated heavy GETs (extend `perf/api-smoke.js` beyond health/login).

### Phase 1 — Stop remaining stampedes (highest ROI left)

| # | Work item | Notes | Status |
|---|-----------|-------|--------|
| 1.1 | Chatter: finish tab-scope + **no full reload after `/seen`** | Biggest residual multi-GET | **Done** (refresh narrowed) |
| 1.2 | Requests: **tab-scoped** fetch (OT / Reg / Realloc) | Don’t bootstrap sibling tabs | **Done** |
| 1.3 | Re-verify overview + scheduler singleflight on cold open | Already wired — confirm no double mount bypass | Re-measure |
| 1.4 | Unused ERP design-list on task lists | `shouldLoadDesignList` | **Done** |
| 1.5 | Designer list `submitted-session` N+1 | Batched field + timer prop | **Done** |
| 1.6 | Residual remount ×2 on sales queue / design-list tasks | Stabilize effects / singleflight | Re-measure |

**Exit criteria:** Cold open of chatter + requests + overview shows no sibling-tab waste and ≤1 copy of each heavy GET.

### Phase 2 — Shrink payloads & paginate (what’s left)

| # | Work item | Notes | Status |
|---|-----------|-------|--------|
| 2.1 | List UI `limit=500` → page 100 | Design list / sales queue | **Done** — don’t regress |
| 2.2 | Sales history backend cursor (replace take 500–1000) | `findSalesHistoryTaskIds` | **Done** — DISTINCT ids |
| 2.3 | Slim + cache `projects-overview` | Parallel inbox + 20s TTL + WS debounce | **Done** (2026-08-07) |
| 2.4 | Slim week assignment DTO + virtualize board/sidebar | DS-04/05/10 | **Partial** — sidebar virtualize + summary DTO slim done; grid open |
| 2.5 | Chatter smaller page + virtualize | CH-05/08 | **Open** |
| 2.6 | Activities slim fields + virtualize (+ prefer WS delta) | TA-03–05 | **Done** (virtualize already; delta + slim 2026-08-07) |
| 2.7 | ERP project-design hub: paginate/slim catalog | SPD-01 intentional load | **Done** |

**Exit criteria:** Largest interactive list payloads typically &lt; ~50KB on warm QA data (exports exempt).

### Phase 3 — Realtime & refetch discipline

| # | Work item | Notes | QA IDs |
|---|-----------|-------|--------|
| 3.1 | Scheduler: on WS refresh, patch from deltas; full reload only when week touched | Already partially done — verify all event types | DS-08 |
| 3.2 | Chatter: local seen/update; narrowed WS refresh (debounce + post merge) | | CH-02 **Done** |
| 3.3 | Designer dashboard: replace ~30s full task reload with WS + longer backup poll | | DD-05 **Done** |
| 3.4 | Defer notifications off critical path on heavy pages | Navbar/layout | DS-07, PO-06, DT-10 |

**Exit criteria:** Idle open tab generates negligible periodic full-list traffic.

### Phase 4 — Backend efficiency

| # | Work item | Notes | Ref |
|---|-----------|-------|-----|
| 4.1 | Batch reallocation remaining-hours queries | `REALLOCATION_GAPS` #11 | **Done** |
| 4.2 | `listEligibleDesigners` — team-first then users | #12 | **Done** |
| 4.3 | Index / query plan check for overview + design-list COUNT | Avoid full join counts where possible | P8 |
| 4.4 | Keep long transactions rare; skip locked weeks in overflow (correctness + less thrash) | `SCHEDULER_FIXES_NEEDED` #11 | |
| 4.5 | Confirm ERP circuit breaker stays effective under live ERP slowness | `RELIABILITY.md` | |

### Phase 5 — Capacity (only after Phases 1–3)

| # | Work item | Caution |
|---|-----------|---------|
| 5.1 | Tune `DB_CONNECTION_LIMIT` for **one** instance (e.g. 30→40) only if SQL Server allows | Don’t guess; watch P2024 |
| 5.2 | Consider PM2 `instances: 2` cluster | **Each** process ≈ own pool → can worsen SQL; needs lower per-instance limit + sticky WS strategy |
| 5.3 | Align PM2 script to `backend/dist/main.js` + `NODE_ENV=production` | Stability & predictable behavior |

---

## 6. Page cheat sheet (focus on remaining work)

### HOD — highest remaining API cost

| Route | Do next (not already done) |
|-------|----------------------------|
| `/design-scheduler` | Week **grid** slim/virtualize still open (sidebar done) |
| `/projects-overview` | Query/cache optimize; lazy secondary sections |
| `/design-list` | Re-measure residual `/tasks` ×2 only |
| `/chatter` | Stop `/seen` full reload; virtualize; finish tab-scope |
| `/hod/requests` (+ tabs) | **Tab-scoped** loading only |
| Team activity | Re-measure only (delta + slim shipped) |

### Designer

| Route | Do next |
|-------|---------|
| `/design-list/tasks` | Re-measure only (N+1 + unused design-list should be gone) |
| `/designer/dashboard` | Re-measure only (WS-first + 3m backup when socket down) |
| Leave / requests | Re-measure only (leave WS-first; full team history tab-lazy; requests tab-scoped) |

### Sales

| Route | Do next |
|-------|---------|
| `/sales/tasks` | Re-measure only (history DISTINCT ids shipped) |
| `/sales/project-design` | Re-measure only (hub paginate + `fields=hub` shipped) |

---

## 7. Implementation patterns (copy these)

### Singleflight for a heavy GET

```ts
import { singleflight } from '@/lib/singleflight';

export function fetchProjectsOverview(weekStart: string) {
  const key = `dashboard/projects-overview:${weekStart}`;
  return singleflight(key, () =>
    apiClient.get(`/dashboard/projects-overview?weekStart=${weekStart}`),
  );
}
```

### List timer without N+1

```jsx
<ProjectTaskTimer
  taskId={item.id}
  initialSubmittedSeconds={item.submittedDurationSeconds ?? null}
/>
```

### Defer notifications (sketch)

```js
useEffect(() => {
  const t = setTimeout(() => loadNotifications(), 0);
  return () => clearTimeout(t);
}, []);
```

### Prefer WS delta over refetch

When `onDashboardRefresh` fires:
1. If `affectedWeekStarts` excludes current week → skip grid reload.
2. If only `changedTaskIds` → patch those cards / refresh queue only.
3. Full `reloadWeek()` only when necessary.

---

## 8. Verification checklist

After each phase:

- [ ] DevTools: duplicates gone on cold open (incognito, disable cache).
- [ ] Payload sizes down on the targeted endpoint.
- [ ] No new functional regressions (scheduler rules, sales queue, chatter seen).
- [ ] Under 2 HOD + several designer tabs: no surge of P2024 / pool timeout in `task-scheduler-error.log`.
- [ ] `curl -sf localhost:7000/api/v1/health/ready` still OK during light load.

**Prod signals** (`DEVOPS.md`):
- Alert ideas: P95 &gt; 2s on `/tasks` and `/scheduler-assignments`; 5xx &gt; 1%; ready 503 &gt; 2 min; cron lock skips rising with user traffic.

---

## 9. Related docs

| Doc | Use for |
|-----|---------|
| `HOD_PERFORMANCE_REPORT.md` | HOD page issue IDs |
| `AJ DESIGNER_PERF_REORT.md` | Designer N+1 / poll issues |
| `SALES_QA_PERFORMANCE_REPORT_SUMMARY.md` | Sales queue/history |
| `SCHEDULER_RULES.md` | Do not “optimize” by breaking scheduler rules |
| `backend/docs/SCHEDULER_FIXES_NEEDED.md` | Scheduler scalability fixes already shipped |
| `backend/docs/REALLOCATION_GAPS.md` | Remaining reallocation efficiency items |
| `backend/docs/RELIABILITY.md` | Timeouts, retries, cron locks |
| `DEPLOYMENT_RUNBOOK.md` | PM2 paths and smoke tests |

---

## 10. Suggested first sprint (remaining open work only)

1. ~~Chatter `/seen` + refresh narrowing~~ **done**  
2. ~~Requests tab-scope~~ **done**  
3. ~~Reallocation `mapWithRemaining` batch~~ **done**  
4. ~~Projects-overview TTL/parallel~~ **done**  
5. ~~Team-activity slim/delta, ERP hub pagination, eligible-designers scan~~ **done**  
6. ~~Scheduler sidebar slim + sales history DISTINCT ids~~ **done**  
7. ~~Designer dashboard poll~~ **done**  
8. ~~Leave planner WS-first + tab-lazy team history~~ **done**  
9. Next: projects-overview deeper cut, scheduler **grid** (careful), overflow locked weeks.

Re-measure designer tasks + design-list + sales queue periodically to confirm July Critical items stay fixed.
