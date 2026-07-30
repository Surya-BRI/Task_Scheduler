# QA PERFORMANCE REPORT SUMMARY

## Page Name: project-design

### Route: /project-list

#### Network Findings

| Metric | Value |
| :--- | :--- |
| Total APIs (page load) | ~5 unique (~6-7 with duplicate) |
| Duplicate APIs | `projects-list x2` |
| Slow APIs (>1s) | 0 this run |
| Failed APIs | 0 this run |

#### Issues Found

| ID | Issue | Category | Severity | Impact | Recommendation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| P1 | `projects-list` called twice on load | Network | High | 2× ERP + COUNT | Singleflight / abort / fix remount |
| P2 | No skeleton / spinner / error UI | Loading UX | High | Blank → sudden data; silent fail | Skeleton + error toast |
| P3 | Search undebounced | Network / UX | High | API storm while typing | Debounce 300-500 ms |
| P4 | Sales Person shows literal "null" (100 cells) | Data / UX | High | Looks broken | Treat null as / Unassigned |
| P5 | `setPage (1)` + fetch deps can double-fetch | Network | Medium | Extra calls on search from page > 1 | Atomic page + query update |
| P6 | Notifications + unread as two calls | Network | Medium | Extra RTT on every page | Combine endpoints |
| P7 | Dual WebSocket connect in dev | WebSocket | Medium | Extra tokens / handlers | Singleton socket |
| P8 | `COUNT(*)` over full join for 7956 | Backend | Medium | Latency under ERP load | Lighter count query / cache total |
| P9 | API lacks HOD role guard | Security | Medium | Non-HOD JWT can call API | Add role / scope guard |
| P10 | Authorized gate returns null | Loading UX | Low-Medium | Extra blank frame | Keep shell + skeleton |

---

## Page Name: design-list

### Route: /design-list

#### Network Findings

| Metric | Value |
| :--- | :--- |
| Total APIs (unique) | 6 |
| Total calls observed | ~8-10 (with duplicates) |
| Duplicate APIs | `/tasks x2`, `ws-token x2` (+ notifs often x2) |
| Slow / Medium APIs | `/design-list` ~558 ms; `/tasks` duplicate ~803 ms |
| Failed APIs | 0 |

#### Issues Found

| ID | Issue | Category | Severity | Impact | Recommendation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| D1 | `/tasks` fetched twice | Network | High | 2x DB load, slower TTI | Singleflight / abort |
| D2 | Unused GET `/design-list` on this page | Network / Arch | High | ERP cost + 31 KB wasted | Don't fetch for DesignListScreen |
| D3 | Dual WebSocket connections | WebSocket | High | Dup tokens + notif/list refresh | One shared socket |
| D4 | Hardcoded `limit=500`, `page=1` | Data / Perf | Critical | Over-fetch; hide tasks >500 | Server pagination page size 100 |
| D5 | Search without debounce | Network | High | Request storms | Debounce |
| D6 | Notifications list + count (+ often dup) | Network | Medium | Extra RTTs | Combine; one socket |
| D7 | Brief blank before skeleton | Loading UX | Low-Medium | Flash | Keep shell while authorizing |
| D8 | HOD tasks unscoped by department | Security / Data | Medium | Over-broad dataset | Confirm intended scope |
| D9 | ERP BU mapping warn spam | Backend | Low | Log noise / CPU | Map codes or rate-limit logs |

---

## Page Name: design-scheduler

### Route: /design-scheduler

#### Network Findings

| Metric | Value |
| :--- | :--- |
| Total API Calls | 11 on initial load (+1 week-meta poll ~30s later → 12) |
| Duplicate API Calls | 3 endpoints x 2 (`users?role=DESIGNER`, `tasks/scheduler-queue`, `auth/ws-token`) |
| Failed Requests | 0 |
| Slow Requests (>1 sec) | 0 |
| WebSocket | `ws-token` fetched 2x; live socket not observed in Resource |
| Page Load Time | Document ~0.6s; interactive ~1.4s; measured settle ~4.3s |

#### Issues Found

| ID | Issue | Category | Severity | Impact | Recommendation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| DS-01 | `scheduler-queue` called twice on load (~20KB each) | Network | High | Doubles heaviest list fetch; delays board readiness | Deduplicate concurrent queue fetch |
| DS-02 | `users?role=DESIGNER` called twice | Network | Medium | Extra round-trips on every open | Single fetch; cache for session |
| DS-03 | `ws-token` called twice; socket not observed | Network | Medium | Auth noise without clear realtime benefit | One token/socket lifecycle; verify connection |
| DS-04 | `scheduler-assignments` ~39KB / ~400ms | Backend | High | Largest load cost for week board | Slim payload fields; consider day/designer scoping |
| DS-05 | Unassigned queue loads all tasks at once (~30 cards, no paging) | Frontend / Backend | Medium | Heavy left panel DOM + drag targets | Virtualize list; lazy-load beyond viewport |
| DS-06 | "Loading session..." blank state before scheduler | Frontend | Medium | Weak perceived performance | Show scheduler skeleton (queue + week grid) |
| DS-07 | Notifications list + unread-count on critical path | Network | Low | Competes with scheduler APIs | Defer until after board interactive |
| DS-08 | Week meta polled ~30s after load | Network | Low | Ongoing background traffic | Prefer WebSocket push or longer idle interval |
| DS-09 | `assignments` + `meta` are separate calls | Network | Low | Extra dependency hop | Combine into one week bootstrap response |
| DS-10 | Dense interactive board (~51 draggables, ~900 nodes) | Frontend | Medium | Risk of jank during drag/filter | Virtualize columns; reduce always-mounted nodes |
| DS-11 | First local compile of route ~11s (dev) | Frontend | Low | Inflates first-open time in local testing | Treat as cold-compile only; measure warm loads for QA |

---

## Page Name: projects-overview

### Route: /projects-overview

#### Network Findings

| Metric | Value |
| :--- | :--- |
| Total API Calls | 7 |
| Duplicate API Calls | 2 groups (`projects-overview x2`, `ws-token x2`) |
| Failed Requests | 0 |
| Slow Requests (>1 sec) | 1 (`projects-overview` duplicate ≈ 1394ms) |
| WebSocket | `ws-token x2`; live socket not observed |
| Page Load Time | Document ~0.8s; interactive ~2.5s; settle ~4.3s |

#### Issues Found

| ID | Issue | Category | Severity | Impact | Recommendation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| PO-01 | `dashboard/projects-overview` called twice on load | Network | Critical | Doubles ~0.5-1.4s work; delays interactivity | Ensure single fetch per week; dedupe concurrent requests |
| PO-02 | Overview API slow (~525-830ms server; up to ~1.4s client) | Backend | High | Blocks all dashboard sections | Optimize query; slim payload; index/cache by weekStart |
| PO-03 | Duplicate payload ~19.6KB ×2 (~39KB wasted) | Network / Backend | High | Extra bandwidth + parse cost | Eliminate duplicate; consider field pruning |
| PO-04 | `ws-token` fetched twice; socket not observed | Network | Medium | Auth noise without clear realtime benefit | Single shared token/socket lifecycle |
| PO-05 | "Loading session..." blank before dashboard | Frontend | Medium | Weak perceived performance | Skeleton for tables + inbox + summary cards |
| PO-06 | Notifications (~14.6KB) on critical path | Network | Low | Competes with overview fetch | Defer until after dashboard paint |
| PO-07 | Separate notifications list + unread-count | Network | Low | Extra round-trip | Combine or derive count from list |
| PO-08 | Large in-scope summary (109 tasks) packed into one response | Backend | Medium | Payload/query cost grows with volume | Paginate section lists; summary counts vs full rows |
| PO-09 | First local route compile ~11.9s (dev cold) | Frontend | Low | Inflates first-open QA timing | Measure warm loads for performance baselines |
| PO-10 | Inbox approval actions loaded with full overview | Frontend / Backend | Low | Heavier first paint if inbox is secondary | Lazy-load inbox after primary task tables |

---

## Page Name: chatter

### Route: /chatter

#### Network Findings

| Metric | Value |
| :--- | :--- |
| Total API Calls | 20 |
| Duplicate API Calls | 5 groups (main feeds up to 4x each) |
| Failed Requests | 0 |
| Slow Requests (>1 sec) | 0 |
| WebSocket | `ws-token x2`; live socket not observed |
| Page Load Time | Document ~2.3s; interactive/stable ~7.7s |

#### Issues Found

| ID | Issue | Category | Severity | Impact | Recommendation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| CH-01 | Main chatter feeds fetched up to 4× on open | Network | Critical | ~251KB traffic; ~7.7s to stabilize | Single-flight fetch; stop remount/refetch loops |
| CH-02 | `POST /seen` triggers full feed reload | Network | High | Extra 3 large GETs after paint | Update local seen state; avoid full refetch |
| CH-03 | Third refetch wave ~3s after load | Network | High | Keeps UI busy after first paint | Identify timer/WS/effect cause; remove redundant refresh |
| CH-04 | Private mention/comment feeds loaded on Posts tab | Network | High | Unnecessary ~10KB+ x repeats | Fetch tab-scoped data only |
| CH-05 | `chatter-posts?limit=50` ~48KB payload | Backend | High | Heavy parse/render cost | Smaller page size; cursor pagination; slim fields |
| CH-06 | `mention-users` + `ws-token` duplicated | Network | Medium | Extra round-trips | Session-level cache / single socket auth |
| CH-07 | "Loading session..." blank state | Frontend | Medium | Weak perceived performance | Feed skeleton while session resolves |
| CH-08 | Dense post list (~85 items / ~1350 nodes) | Frontend | Medium | Scroll/jank risk | Virtualize feed; lazy comments |
| CH-09 | Notifications on critical path (~14.6KB) | Network | Low | Competes with feed load | Defer after first posts paint |
| CH-10 | No observed live WebSocket despite tokens | Network | Medium | Relies on costly refetch instead of push | Validate realtime path; avoid blind polling |

---

## Page Name: Chatter Private

### Route: /chatter?tab=private

#### Network Findings

| Metric | Value |
| :--- | :--- |
| Total API Calls | 15 |
| Duplicate API Calls | 5 groups (mentions/comments up to 3x) |
| Failed Requests | 0 |
| Slow Requests (>1 sec) | 0 (several 500-870ms) |
| WebSocket | `ws-token x2`; live socket not observed |
| Page Load Time | Document ~1.4s; interactive ~2.5s |

#### Issues Found

| ID | Issue | Category | Severity | Impact | Recommendation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| CP-01 | Private tab fetches full Posts feed (`limit=50`) | Network | High | ~48-96KB unused data | Fetch Private-scoped APIs only |
| CP-02 | Mention feed fetched 3x | Network | High | Extra latency up to ~870ms each | Deduplicate single-flight |
| CP-03 | Commented-by feed fetched 3x | Network | High | Triples small but repeated DB work | Same dedupe as mentions |
| CP-04 | `mention-users` + `ws-token` duplicated | Network | Medium | Extra auth/bootstrap cost | Session cache |
| CP-05 | Several chatter calls 500-870ms under load | Backend | Medium | Slower Private first paint | Optimize filtered queries; indexes |
| CP-06 | "Loading session..." before Private panels | Frontend | Medium | Blank perceived load | Skeleton for Mentioned/Comments sections |
| CP-07 | Notifications loaded with Private bootstrap | Network | Low | Non-critical path contention | Defer layout notifications |
| CP-08 | `limit=200` on mention/comment queries | Backend | Low | Over-fetch if lists grow | Paginate private lists |
| CP-09 | No live WebSocket observed | Network | Medium | Falls back to duplicate HTTP loads | Prefer push updates for mentions |

---

## Page Name: Chatter task updates

### Route: /chatter?tab=task-updates

#### Network Findings

| Metric | Value |
| :--- | :--- |
| Total API Calls | 13 |
| Duplicate API Calls | 5 groups (each chatter bootstrap endpoint ×2) |
| Failed Requests | 0 |
| Slow Requests (>1 sec) | 0 (several 500-600ms) |
| WebSocket | `ws-token x2`; live socket not observed |
| Page Load Time | Document ~1.5s; interactive ~2.3s |

#### Issues Found

| ID | Issue | Category | Severity | Impact | Recommendation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| CT-01 | Task Updates loads Private mention/comment feeds | Network | High | Wasted ~20KB+ and extra DB work | Tab-scoped data loading |
| CT-02 | All chatter bootstrap APIs duplicated x2 | Network | High | Doubles open cost | Singleflight / dedupe |
| CT-03 | Uses full posts payload (~48KB x2) for grouped list | Backend / Frontend | High | Over-fetch for summary UI | Dedicated task-updates summary API |
| CT-04 | Medium-latency concurrent chatter calls (500-600ms) | Backend | Medium | Slows first interactive paint | Reduce concurrency via dedupe; optimize query |
| CT-05 | Possible duplicate OP rows in Task Updates list | Frontend | Medium | Confusing UX / extra render work | Deduplicate grouping keys |
| CT-06 | "Loading session..." blank state | Frontend | Medium | Weak perceived performance | List skeleton |
| CT-07 | `mention-users` fetched though unused on this tab | Network | Medium | Unnecessary call | Lazy-load only when composing/mentioning |
| CT-08 | Notifications on critical path | Network | Low | Contends with chatter bootstrap | Defer |
| CT-09 | `ws-token x2` without observed socket | Network | Medium | Auth noise; no push benefit seen | One socket lifecycle |

---

## Page Name: team-activity

### Route: /team-activity

#### Network Findings

| Metric | Value |
| :--- | :--- |
| Total API Calls | 6 app APIs on first load (+ 7 avatar requests); activities continues every ~20s |
| Duplicate API Calls | `activities?limit=100 ×2` on open (then ongoing polls) |
| Failed Requests | 0 core APIs; some `/api/?name=...` avatar-proxy attempts showed 0 transfer size |
| Slow Requests (>1 sec) | 0 (activities peak ~835ms) |
| WebSocket | `ws-token x1`; live socket not observed (HTTP polling used instead) |
| Page Load Time | Document ~1.4s; first interactive ~3.5s; ongoing refetch every ~20s |

#### Issues Found

| ID | Issue | Category | Severity | Impact | Recommendation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| TA-01 | `activities?limit=100` called twice on open (~112KB each) | Network | Critical | ~224KB wasted; delays first paint | Singleflight-fetch; dedupe concurrent requests |
| TA-02 | Full activities feed polled every ~20s | Network | Critical | Continuous ~112KB + DB load while page open | Use WebSocket/SSE or incremental sync; longer interval |
| TA-03 | Large activities payload (~112KB / 100 rich items) | Backend | High | Slow parse + heavy render | Smaller page size; slim fields; cursor pagination |
| TA-04 | Renders all ~100 items (~3100 DOM / ~320 controls) | Frontend | High | Scroll jank / memory pressure | Virtualize feed; paginate UI |
| TA-05 | No pagination / load-more observed | Frontend / Backend | High | Always pays full list cost | Infinite scroll or paged fetch |
| TA-06 | External avatar CDN fan-out (`ui-avatars.com`) | Network / Security | Medium | Extra latency; third-party dependency; names sent externally | Local initials/SVG; cache by userId |
| TA-07 | Repeated avatar `<img>` for same users | Frontend | Medium | Extra image work / layout cost | Shared avatar component cache |
| TA-08 | "Loading session..." blank before feed | Frontend | Medium | Weak perceived performance | Feed skeleton with filter chrome |
| TA-09 | Notifications on critical path | Network | Low | Contends with activities fetch | Defer after feed paint |
| TA-10 | `ws-token` present but polling used | Network | Medium | Missed realtime efficiency | Prefer push events over full refetch |
| TA-11 | First local compile ~8.4s (dev cold) | Frontend | Low | Inflates first QA open only | Use warm-load timings for baselines |

---

## Page Name: leave request

### Route: /designer/leave-planner

#### Network Findings

| Metric | Value |
| :--- | :--- |
| Total API Calls | 8 on first load (+5 polled ~45s later → 13 observed) |
| Duplicate API Calls | 0 on initial load |
| Failed Requests | 0 |
| Slow Requests (>1 sec) | 0 |
| WebSocket | `ws-token x1`; live socket not observed (HTTP poll ~45s) |
| Page Load Time | Document ~1.5s; interactive ~2.3s |

#### Issues Found

| ID | Issue | Category | Severity | Impact | Recommendation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| LP-01 | Three separate request APIs on open (personal, team, pending) | Network | High | Extra latency / DB work for one screen | Single planner bootstrap response |
| LP-02 | `team-requests` ~35KB loaded even when HOD history tab is default | Network / Backend | High | Pays full team cost before user needs it | Lazy-load team history on tab open; slim fields |
| LP-03 | Full leave dataset re-fetched every 45s | Network | Medium | Ongoing ~40KB+ traffic while idle | Prefer WebSocket/SSE; longer interval; conditional requests |
| LP-04 | Notifications (~14.6KB) on critical path | Network | Low | Contends with planner APIs | Defer after calendar paint |
| LP-05 | Separate notifications list + unread-count | Network | Low | Extra round-trip | Combine or derive count |
| LP-06 | "Loading session..." blank before planner | Frontend | Medium | Weak perceived performance | Calendar + history skeleton |
| LP-07 | Year grid is wide (12×31-style table, ~432 cells) | Frontend | Low | Moderate DOM cost as data grows | Virtualize months or load quarter views |
| LP-08 | Route is `/designer/leave-planner` for HOD review | Frontend / Security | Low | Confusing IA; verify role gates stay correct | Confirm HOD-only actions; clearer HOD route naming |
| LP-09 | `ws-token` present but polling used | Network | Medium | Missed realtime efficiency for approvals | Push pending-approval updates |
| LP-10 | First local compile 5s (dev cold) | Frontend | Low | Inflates first-open QA only | Use warm-load baselines |

---

## Page Name: overtime requests

### Route: /designer/requests?forDesignerId=94ba8e71-80ef-4bb8-8373-2a526c8aa987

#### Network Findings

| Metric | Value |
| :--- | :--- |
| Total API Calls | 16 on first load (+2 polled ~30s later → 18) |
| Duplicate API Calls | 3 groups x2 (DESIGNER users, regularization team-requests, OT pending-approvals) |
| Failed Requests | 0 |
| Slow Requests (>1 sec) | 0 |
| WebSocket | `ws-token x1`; live socket not observed (HTTP poll ~30s) |
| Page Load Time | Document ~1.3s; interactive ~2.2s |

#### Issues Found

| ID | Issue | Category | Severity | Impact | Recommendation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| OT-01 | `projects?limit=500` (~145KB) on Overtime open | Network / Backend | Critical | Dominates payload; unnecessary for today's task picker | Drop full catalog; use task-options / search-as-you-type |
| OT-02 | `tasks?limit=200` (~31KB) plus separate task-options | Network | High | Duplicate task loading paths | One scoped task source for the form |
| OT-03 | Regularization APIs loaded on Overtime tab | Network | High | Extra 13KB+ and DB work unused on first view | Lazy-load Regularization/Reallocation on tab switch |
| OT-04 | Duplicate DESIGNER users / team-requests / pending-approvals | Network | High | Doubles several bootstrap calls | Single-flight / dedupe effects |
| OT-05 | Pending + team requests polled every 30s | Network | Medium | Ongoing background traffic | WebSocket/SSE or longer conditional poll |
| OT-06 | "Loading session..." blank state | Frontend | Medium | Weak perceived performance | Form + table skeleton |
| OT-07 | Empty task day still pulls huge projects/tasks payloads | Backend / Frontend | High | Pays max cost for empty UX | Short-circuit when task-options empty |
| OT-08 | Notifications on critical path (~14.6KB) | Network | Low | Contends with request bootstrap | Defer after form paint |
| OT-09 | `forDesignerId` UUID exposed in URL | Security | Medium | Potential IDOR if not server-validated | Enforce role/ownership on every request API |
| OT-10 | Route under `/designer/requests` for HOD workflow | Frontend | Low | Confusing IA for HOD testers | Clearer HOD entry path (auth still required) |
| OT-11 | `ws-token` fetched but no live socket observed | Network | Medium | Relies on polling | Prefer push for pending approvals |

---

## Page Name: regularization

### Route: /designer/requests?forDesignerId=94ba8e71-80ef-4bb8-8373-2a526c8aa987&tab=regularization

#### Network Findings

| Metric | Value |
| :--- | :--- |
| Total API Calls | 16 on first load (+2 polled ~30s later → 18) |
| Duplicate API Calls | 3 groups x2 (DESIGNER users, regularization team-requests, OT pending-approvals) |
| Failed Requests | 0 |
| Slow Requests (>1 sec) | 0 (peak ~826ms) |
| WebSocket | `ws-token x1`; live socket not observed (HTTP poll ~30s) |
| Page Load Time | Document ~1.2s; interactive ~2.4s |

#### Issues Found

| ID | Issue | Category | Severity | Impact | Recommendation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| RG-01 | `projects?limit=500` (~145KB) on Regularization open | Network / Backend | Critical | Dominates payload for a small form + 4-row table | Remove full catalog; scoped search / task-by-date API |
| RG-02 | Overtime APIs loaded on Regularization tab | Network | High | Wasted OT history, task-options, OT pending calls | Tab-scoped fetching only |
| RG-03 | `tasks?limit=200` (~31KB) for form that waits on date | Network | High | Heavy upfront cost before user picks date | Fetch tasks after date selection |
| RG-04 | Duplicate users / team-requests / OT pending-approvals | Network | High | Doubles bootstrap work; pending up to ~826ms | Single-flight dedupe |
| RG-05 | Shared 30s poll includes OT pending-approvals | Network | Medium | Background OT traffic on Reg tab | Poll only active-tab resources; prefer push |
| RG-06 | "Loading session..." blank before form | Frontend | Medium | Weak perceived performance | Form + history skeleton |
| RG-07 | Notifications on critical path (~14.6KB) | Network | Low | Contends with first request APIs | Defer after first paint |
| RG-08 | `forDesignerId` UUID in query string | Security | Medium | Potential IDOR if not validated server-side | Enforce role/ownership on all request APIs |
| RG-09 | No pagination on history (small now; risk later) | Backend / Frontend | Low | Will degrade as volume grows | Paginate All Regularization Requests |
| RG-10 | `ws-token` present without observed live socket | Network | Medium | Missed realtime; falls back to polling | Use push for pending/team updates |

---

## Page Name: reallocation

### Route: /designer/requests?forDesignerId=94ba8e71-80ef-4bb8-8373-2a526c8aa987&tab=reallocation

#### Network Findings

| Metric | Value |
| :--- | :--- |
| Total API Calls | 20 on first load (+2 polled ~30s later → 22) |
| Duplicate API Calls | DESIGNER users ×2; regularization team-requests ×3; OT pending-approvals ×3 |
| Failed Requests | 0 |
| Slow Requests (>1 sec) | 0 (peak ~746ms) |
| WebSocket | `ws-token x1`; live socket not observed |
| Page Load Time | Document ~2.7s; first interactive ~4.2s |

#### Issues Found

| ID | Issue | Category | Severity | Impact | Recommendation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| RA-01 | `projects?limit=500` (~145KB) on Reallocation open | Network / Backend | Critical | Dominates load for empty history page | Remove from this tab; use reallocation task-options only |
| RA-02 | Overtime + Regularization APIs loaded on Reallocation tab | Network | Critical | Large wasted traffic / DB work | Tab-scoped data loading |
| RA-03 | `tasks?limit=200` plus reallocation task-options | Network | High | Duplicate task sources | Keep only reallocation task-options |
| RA-04 | Duplicate users / Reg team-requests / OT pending (up to x3) | Network | High | Extra latency under contention | Single-flight dedupe |
| RA-05 | ~30s poll refreshes OT/Reg, not reallocation | Network | Medium | Background noise on wrong resources | Poll active-tab APIs only; prefer push |
| RA-06 | `eligible-designers` chained after task auto-select | Network | Medium | Extends time-to-interactive ~4.2s | Prefetch eligible with task-options or parallelize |
| RA-07 | "Loading session..." blank state | Frontend | Medium | Weak perceived performance | Form skeleton |
| RA-08 | React hydration error overlay in dev | Frontend | Medium | Possible render instability / extra work | Fix hydration mismatch in providers |
| RA-09 | HOD sees designer-oriented reallocation copy | Frontend | Low | Confusing HOD workflow UX | Role-aware messaging |
| RA-10 | `forDesignerId` UUID in query string | Security | Medium | Potential IDOR if not server-enforced | Validate designer scope on all APIs |
| RA-11 | Notifications on critical path | Network | Low | Contends with bootstrap | Defer after form paint |
