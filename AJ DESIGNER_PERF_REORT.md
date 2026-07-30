# AJ(alex jhonson) DESIGNER QA PERFORMANCE REPORT SUMMARY

**Account**: Designer Account

---

## Page Name: Designer-task list

### Route: /design-list/tasks

#### Network Findings

| Metric | Result |
| :--- | :--- |
| Total API Calls | 53 (Designer cold load) |
| Duplicate API Calls | 24 groups (`tasks x2`, `running-timer x2`, `ws-token x3`, 21 `submitted-session` endpoints x2) |
| Failed Requests | 0 (Designer run) |
| Slow Requests (>1 sec) | 0 (23 calls in 500-907ms under contention) |
| WebSocket | `ws-token x3`; live socket not observed |
| Page Load Time | Document ~0.5s; interactive ~2.2s (after N+1 wave) |

#### Issues Found

| ID | Issue | Category | Severity | Impact | Recommendation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| DT-01 | N+1 `tasks/(id)/submitted-session` (42 calls for ~21 rows) | Network / Backend | Critical | Dominates load; server contention; delays interactivity | Batch endpoint or include session summary in tasks list |
| DT-02 | Each `submitted-session` also duplicated (x2) | Network | Critical | Doubles N+1 cost | Single-flight / fix remount double-fetch |
| DT-03 | Unused GET `/design-list` (~273KB) on Tasks page | Network / Arch | Critical | Huge wasted ERP payload | Do not fetch `design-list` for `/design-list/tasks` |
| DT-04 | `tasks?page=1&limit=500` fetched twice | Network | High | Extra ~32KB + DB work | Deduplicate; lower page size |
| DT-05 | Hardcoded limit 500 | Data / Perf | High | Over-fetch; hides risk past 500 | Paginate (e.g., 50-100) |
| DT-06 | `ws-token` called 3x | Network | High | Auth noise; unstable realtime setup | One shared socket lifecycle |
| DT-07 | `running-timer` called twice | Network | Medium | Extra round-trip | Single fetch / cache |
| DT-08 | HOD hard-nav to route ends on login | Security / UX | High | HOD cannot reliably open page; session loss | Clear role guard UX; no silent logout; don't prefetch huge design-list before auth gate |
| DT-09 | "Loading session..." blank before table | Frontend | Medium | Weak perceived performance | Table skeleton |
| DT-10 | Notifications on critical path | Network | Low | Contends with tasks bootstrap | Defer after first rows paint |
| DT-11 | Dense Actions column with per-row timers | Frontend | Medium | Extra DOM + timer UI cost | Virtualize; compute times from batched data |
| DT-12 | Search present without confirmed debounce | Network / UX | Medium | Risk of request storms while typing | Debounce 300-500ms |

---

## Page Name: Designer-Dashboard

### Route: /designer/dashboard

#### Network Findings

| Metric | Result |
| :--- | :--- |
| Total API Calls | 9 on first load (+5 delayed polls → 14 observed) |
| Duplicate API Calls | 2 groups (`tasks x2`, `ws-token x2`) |
| Failed Requests | 0 |
| Slow Requests (>1 sec) | 0 |
| WebSocket | `ws-token x2`; live socket not observed |
| Page Load Time | Document ~0.5s; interactive ~1.5s |

#### Issues Found

| ID | Issue | Category | Severity | Impact | Recommendation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| DD-01 | `tasks?limit=20` called twice on load | Network | High | ~65KB wasted; extra DB work | Single-flight / dedupe concurrent fetch |
| DD-02 | Tasks page size limit 200 for dashboard | Backend / Network | High | Over-fetch vs week board needs | Week-scoped or `/count` API |
| DD-03 | Full regularization list for pending badge | Network | Medium | Extra ~3.7KB + query | Lightweight pending-count endpoint |
| DD-04 | `ws-token` fetched twice; socket not observed | Network | Medium | Auth noise without clear realtime benefit | One token/socket lifecycle |
| DD-05 | ~30s poll reloads tasks + assignments | Network | Medium | Ongoing ~40KB+ traffic while idle | Prefer WebSocket/SSE; longer conditional poll |
| DD-06 | Notifications (~14KB) on critical path | Network | Low | Contends with dashboard APIs | Defer after board paint |
| DD-07 | Separate notifications list + unread-count | Network | Low | Extra round-trip | Combine or derive count |
| DD-08 | "Loading session..." blank before dashboard | Frontend | Medium | Weak perceived performance | Skeleton for stats + week grid + tabs |
| DD-09 | Wide hour grid (7 days x 12 hour columns) | Frontend | Low | DOM cost grows with denser chips | Virtualize off-screen days/hours |
| DD-10 | Active tab empty still downloads full task list | Frontend / Backend | Medium | Pays max cost for empty Active view | Lazy-load tab tables; use counts from summary |

---

## Page Name: Designer-Leave Request

### Route: /designer/leave-planner

#### Network Findings

| Metric | Result |
| :--- | :--- |
| Total API Calls | 5 |
| Duplicate API Calls | 0 |
| Failed Requests | 0 |
| Slow Requests (>1 sec) | 0 |
| WebSocket | `ws-token x1`; live socket not observed |
| Page Load Time | Document ~0.6s; interactive ~1.05s |

#### Issues Found

| ID | Issue | Category | Severity | Impact | Recommendation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| DL-01 | Notifications (~14KB) on critical path = leave payload size | Network | Medium | Competes with planner-critical requests call | Defer until after calendar/history paint |
| DL-02 | Separate notifications list + unread-count | Network | Low | Extra round-trip | Combine or derive count |
| DL-03 | "Loading session..." blank before planner | Frontend | Medium | Minor perceived delay | Calendar + history skeleton |
| DL-04 | Year grid wide (~552 cells) | Frontend | Low | Moderate DOM as markers grow | Quarter view / virtualize months |
| DL-05 | Long Leave History list without observed pagination | Frontend / Backend | Medium | Heavier table as history grows | Paginate or virtualize history |
| DL-06 | `ws-token` present without observed live socket | Network | Low | Unused realtime path | Connect socket or skip token until needed |
| DL-07 | Search without confirmed debounce | Network / UX | Low | Risk of client filter cost/future API storms | Debounce if search hits API |

---

## Page Name: Designer-overtime

### Route: /designer/requests

#### Network Findings

| Metric | Result |
| :--- | :--- |
| Total API Calls | 12 |
| Duplicate API Calls | 1 path x2 (`/api/v1/users?role=DESIGNER`) |
| Failed Requests | 2 (both 403 on users) |
| Slow Requests (>1 sec) | 0 |
| WebSocket | `/api/auth/ws-token` once; no live Socket.IO observed |
| Page Load Time | Nav ~620ms; APIs settle ~1.3s; measure window ~5.6s |

#### Issues Found

| ID | Issue | Category | Severity | Impact | Recommendation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| DO-01 | `projects?limit=500` returns ~145 KB on OT page | Network / Backend | Critical | Dominates payload; slows TTI; most data unused when no tasks assigned | Load only projects linked to OT-eligible tasks; reduce default limit |
| DO-02 | Designer calls `users?role=DESIGNER` twice → 403 | Network / Security | High | Failed duplicate requests; wrong role API on Designer route | Do not call HOD-scoped user list for Designer; gate by role |
| DO-03 | `tasks?limit=200` (~32 KB) plus empty task-options | Network / Backend | High | Large fetch when form already has no assignable tasks | Prefer task-options; slim payload; avoid broad limit=200 for OT form |
| DO-04 | Regularization list fetched while Overtime tab active | Network | High | Extra ~3.7 KB + work before user opens Reg tab | Lazy-load per tab |
| DO-05 | Layout notifications (~14 KB) + unread-count on critical path | Network | Medium | Competes with OT data | Defer/parallelize after first paint of OT UI |
| DO-06 | `scheduler-assignments` (~10 KB) for header stats on Requests | Network | Medium | Extra dependency for chrome, not OT table | Cache across Designer routes; defer if not blocking form |
| DO-07 | `ws-token` without observed live WebSocket | Network | Medium | Token cost without realtime benefit | Confirm WS connect or drop unused token fetch |
| DO-08 | Brief "Loading session..." blank before Requests UI | Frontend | Medium | Perceived delay on every entry | Faster shell / skeleton for OT form + table |
| DO-09 | Project/Task selects disabled ("No tasks assigned for today") after heavy bootstrap | Frontend / UX | Low-Medium | User waits for large APIs then cannot submit OT | Still ok UX messaging; avoid heavy fetches when task-options empty |
| DO-10 | OT history table small (6 rows) but page still pulls catalog-scale data | Frontend / Backend | Medium | Mismatch: light UI, heavy network | Align fetch scope with visible OT history + form needs |
| DO-11 | Sensitive/admin-style user enumeration endpoint attempted by Designer | Security | Medium | 403 correctly denies, but client should not attempt | Role-aware client; ensure server remains deny-by-default |

---

## Page Name: Designer-regularization

### Route: /designer/requests?tab=regularization

#### Network Findings

| Metric | Result |
| :--- | :--- |
| Total API Calls | 12 |
| Duplicate API Calls | 1 path x2 (`/api/v1/users?role=DESIGNER`) |
| Failed Requests | 2 (both 403 on users) |
| Slow Requests (>1 sec) | 0 |
| WebSocket | `/api/auth/ws-token` once; no live Socket.IO observed |
| Page Load Time | Nav ~593ms; APIs settle ~1.4s; measure window ~5.6s |

#### Issues Found

| ID | Issue | Category | Severity | Impact | Recommendation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| DR-01 | `projects?limit=500` (~145 KB) on Regularization tab | Network / Backend | Critical | Dominates payload; slows TTI for a small form + 6-row table | Scope projects to Reg needs; reduce default limit |
| DR-02 | Designer calls `users?role=DESIGNER` twice → 403 | Network / Security | High | Failed duplicate requests on every entry | Gate HOD-only APIs by role; remove from Designer bootstrap |
| DR-03 | Overtime list + OT task-options fetched on Reg tab | Network | High | Extra ~2.8 KB + empty task-options work before user opens OT | Lazy-load Overtime data only on OT tab |
| DR-04 | `tasks?limit=200` (~32 KB) while Task select waits for date | Network / Backend | High | Large early fetch; form does not need full list upfront | Fetch tasks after date / via slim options endpoint |
| DR-05 | Shared bootstrap ignores `?tab=regularization` | Network / Frontend | High | Same cost as Overtime page despite different UI | Load tab-critical APIs first; defer others |
| DR-06 | Layout notifications (~14 KB) + unread-count on critical path | Network | Medium | Competes with Reg data | Defer after Reg shell paints |
| DR-07 | `scheduler-assignments` (~10 KB, ~628 ms) for header chrome | Network | Medium | Medium-latency dependency not tied to Reg table | Cache across Designer pages; defer if non-blocking |
| DR-08 | `ws-token` without observed live WebSocket | Network | Medium | Token cost without realtime benefit | Confirm WS connect or drop unused fetch |
| DR-09 | Brief "Loading session..." blank before Reg UI | Frontend | Medium | Perceived delay on deep-link entry | Skeleton for Reg form + history |
| DR-10 | Light UI (6 history rows) vs ~208 KB API payload | Frontend / Backend | Medium | Performance cost disproportionate to visible data | Align fetch scope with Reg form + history |
| DR-11 | Admin-style user list attempted by Designer (denied) | Security | Medium | 403 is correct; client should not attempt | Role-aware client; keep server deny-by-default |

---

## Page Name: Designer-reallocation

### Route: /designer/requests?tab=reallocation

#### Network Findings

| Metric | Result |
| :--- | :--- |
| Total API Calls | 14 |
| Duplicate API Calls | 1 path x2 (`/api/v1/users?role=DESIGNER`) |
| Failed Requests | 2 (both 403 on users) |
| Slow Requests (>1 sec) | 0 |
| WebSocket | `/api/auth/ws-token` once; no live Socket.IO observed |
| Page Load Time | Nav ~574ms; APIs settle ~1.5s; measure window ~5.5s |

#### Issues Found

| ID | Issue | Category | Severity | Impact | Recommendation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| DX-01 | `projects?limit=500` (~145 KB) on Reallocation tab | Network / Backend | Critical | Dominates payload for a 1-row history + empty form | Scope projects to realloc needs or drop when task-options empty |
| DX-02 | Designer `users?role=DESIGNER` x2 → 403; UI shows "No eligible designers" | Network / Security / UX | Critical | Failed authz + broken suggested-designer picker | Use a Designer-allowed eligible-designers API; stop HOD-only user list |
| DX-03 | OT + Reg lists and OT task-options load on Reallocation | Network | High | Extra work/payload before Reallocation is useful | Lazy-load per tab |
| DX-04 | `tasks?limit=200` (~32 KB) while realloc task-options returns `[]` | Network / Backend | High | Large fetch with no form benefit in this state | Prefer task-options only; avoid broad pre-fetch |
| DX-05 | Shared bootstrap ignores `?tab=reallocation` (14 APIs vs lighter tab needs) | Network / Frontend | High | Highest call count of Designer Requests tabs | Load realloc + auth first; defer OT/Reg/projects |
| DX-06 | Empty form ("No reallocatable tasks") after ~209 KB bootstrap | Frontend / UX | High | Poor perceived performance: wait then cannot act | Short-circuit heavy fetches when options empty; clearer empty-state earlier |
| DX-07 | Layout notifications (~14 KB) on critical path | Network | Medium | Competes with realloc data | Defer after shell paint |
| DX-08 | `scheduler-assignments` (~10 KB, ~696 ms) for header chrome | Network | Medium | Medium-latency dependency unrelated to realloc table | Cache/defer |
| DX-09 | `ws-token` without observed live WebSocket | Network | Medium | Token cost without realtime benefit | Confirm WS connect or drop unused fetch |
| DX-10 | Brief "Loading session..." blank before Reallocation UI | Frontend | Medium | Perceived delay on deep-link | Skeleton for form + "My requests" |
| DX-11 | Submit disabled with empty options after full network round-trip | Frontend | Medium | Interactive page is non-actionable | Surface empty state sooner; avoid blocking on unrelated APIs |
| DX-12 | Admin-style user enumeration attempted by Designer (denied) | Security | Medium | 403 correct; client should not attempt | Role-aware client; authorized peer-list endpoint if needed |

---

## Page Name: Designer-chatter

### Route: /chatter

#### Network Findings

| Metric | Result |
| :--- | :--- |
| Total API Calls | 17 |
| Duplicate API Calls | 5 duplicated paths (Posts ×3, Mentions x3, Commented x3, `mention-users x2`, `ws-token x2`) |
| Failed Requests | 0 |
| Slow Requests (>1 sec) | 0 |
| WebSocket | `/api/auth/ws-token x2`; no live Socket.IO observed |
| Page Load Time | Nav ~5.0s; APIs settle ~7.4s; measure window ~7.1s |

#### Issues Found

| ID | Issue | Category | Severity | Impact | Recommendation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| DC-01 | `chatter-posts?limit=50` fetched 3x (~48 KB each) | Network | Critical | ~144 KB wasted; delays settle time | Dedupe mounts; single source of truth; no blind full refetch |
| DC-02 | Mentions + Commented feeds loaded on default Posts tab (3x each) | Network | Critical | Extra work for inactive tabs | Lazy-load Private / Task Updates on tab open |
| DC-03 | `POST /seen` triggers full multi-feed refresh | Network / Frontend | High | Third wave of API calls after UI already painted | Update local seen state; refetch only if required |
| DC-04 | Document load ~5s before chatter APIs complete path | Frontend / Loading | High | Slow time-to-interactive | Investigate long shell/session gate; skeleton feed earlier |
| DC-05 | Dense feed render (~41 cards, ~1.3k DOM, ~110 controls) | Frontend | High | Main-thread / scroll cost as feed grows | Virtualize list; paginate / infinite scroll |
| DC-06 | `mention-users` fetched twice on load | Network | Medium | Duplicate small call | Cache mention directory for session |
| DC-07 | `ws-token x2` without live WebSocket | Network | Medium | Token cost without realtime updates | Single token; connect WS or stop unused fetch |
| DC-08 | Layout notifications (~14 KB) on critical path | Network | Medium | Competes with feed hydration | Defer after first Posts paint |
| DC-09 | Off-tab queries use `limit=200` | Backend / Network | Medium | Over-fetch risk as data grows | Smaller page size; cursor pagination |
| DC-10 | Brief "Loading session..." blank before Chatter | Frontend | Medium | Perceived blank period | Persist session shell; feed skeleton |
| DC-11 | Feed shows "Seen by..." with full names in list | Security / Privacy | Low-Medium | Extra PII in payloads/UI for every post | Confirm need; consider counts-only for list view |

---

## Page Name: Designer-chatter private

### Route: /chatter?tab=private

#### Network Findings

| Metric | Result |
| :--- | :--- |
| Total API Calls | 15 |
| Duplicate API Calls | 5 paths (Posts x2, Mentions x3, Commented x3, `mention-users x2`, `ws-token x2`) |
| Failed Requests | 0 |
| Slow Requests (>1 sec) | 0 |
| WebSocket | `ws-token x2`; no live Socket.IO |
| Page Load Time | Nav ~2.9s; APIs settle ~4.1s |

#### Issues Found

| ID | Issue | Category | Severity | Impact | Recommendation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| DCP-01 | Posts feed (~48 KB) loaded x2 on Private tab | Network | Critical | Large unused payload | Lazy-load Posts only on Posts tab |
| DCP-02 | Mentions feed fetched ×3 | Network | Critical | Triple download of Private data | Dedupe fetch / single owner |
| DCP-03 | Commented (Task Updates) feed x3 on Private | Network | High | Off-tab work | Lazy-load on Task Updates |
| DCP-04 | Shared bootstrap ignores `?tab=private` | Network / Frontend | High | Same cost pattern as default Chatter | Load active-tab feed first |
| DCP-05 | `mention-users x2`; `ws-token x2`; no WS | Network | Medium | Duplicate overhead | Cache; confirm WS |
| DCP-06 | Layout notifications on critical path | Network | Medium | Competes with Private feed | Defer after first paint |
| DCP-07 | "Loading session..." blank | Frontend | Medium | Perceived delay | Skeleton for Mentioned You |
| DCP-08 | Off-tab queries use `limit=200` | Backend | Medium | Growth risk | Paginate |

---

## Page Name: Designer-chatter task updates

### Route: /chatter?tab=task-updates

#### Network Findings

| Metric | Result |
| :--- | :--- |
| Total API Calls | 13 |
| Duplicate API Calls | 5 paths x2 each (Posts, Mentions, Commented, `mention-users`, `ws-token`) |
| Failed Requests | 0 |
| Slow Requests (>1 sec) | 0 |
| WebSocket | `ws-token x2`; no live Socket.IO |
| Page Load Time | Nav ~2.4s; APIs settle ~3.3s |

#### Issues Found

| ID | Issue | Category | Severity | Impact | Recommendation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| DCT-01 | Posts feed (`~48 KB`) ×2 on Task Updates | Network | Critical | Dominates payload | If needed, fetch once; else dedicated slim endpoint |
| DCT-02 | Mentions feed x2 while on Task Updates | Network | High | Off-tab waste | Lazy-load Private |
| DCT-03 | Commented API nearly empty but UI shows many cards | Network / Frontend | High | Wrong data dependency; confusing perf profile | Align Task Updates with correct API; drop unused fetches |
| DCT-04 | All chatter queries double-fired | Network | High | 2x network/CPU | Dedupe mount effects |
| DCT-05 | `ws-token x2` without live WS | Network | Medium | Overhead without realtime | Single token or connect WS |
| DCT-06 | Notifications on critical path | Network | Medium | Competes with feed | Defer |
| DCT-07 | Session blank + dense project card list | Frontend | Medium | Scroll/render cost as list grows | Skeleton; virtualize |
| DCT-08 | `limit=200` on off-tab queries | Backend | Medium | Scale risk | Paginate; load active tab only |

---

## Page Name: Designer- Team activity

### Route: /designer/team-activity

#### Network Findings

| Metric | Result |
| :--- | :--- |
| Total API Calls | ~6 on first interactive path; 16+ if including ~20s poll cycles in extended observation |
| Duplicate API Calls | `activities?limit=100 ×2` on load, then again every ~20s |
| Failed Requests | 0 (API); avatar CDN may fail/block (0-byte timing entries observed) |
| Slow Requests (>1 sec) | 0 |
| WebSocket | `ws-token` once; no live Socket.IO (HTTP poll used instead) |
| Page Load Time | Nav ~0.55s; first feed ~1.5s; ongoing poll every ~20s |

#### Issues Found

| ID | Issue | Category | Severity | Impact | Recommendation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| DTA-01 | `activities?limit=100` (~110 KB) fetched twice on load | Network / Backend | Critical | ~220 KB before interaction | Dedupe; smaller page size |
| DTA-02 | Full activities list re-fetched every ~20s (~110 KB) | Network | Critical | Continuous bandwidth/CPU jank; memory risk | Incremental poll, ETag, or WebSocket |
| DTA-03 | ~100 items / ~3k DOM / ~100 images rendered | Frontend | High | Extra latency; privacy/CDN risk | Virtualize; paginate |
| DTA-04 | `ui-avatars` CDN dependency | Network / Frontend | Medium | Privacy / dependency risk | Self-host initials or local avatars |
| DTA-05 | `ws-token` without live WS while polling | Network | Medium | Wrong realtime strategy | Use WS or drop token |
| DTA-06 | Notifications re-polled with activities | Network | Medium | Extra periodic load | Longer interval / push |
| DTA-07 | Session blank before feed | Frontend | Medium | Perceived delay | Skeleton list |
| DTA-08 | Designer route exposes dense team-wide activity | Security / Product | Low-Medium | Confirm intended scope for Designer | Ensure role-scoped activity visibility |
