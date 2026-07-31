# SALES QA PERFORMANCE REPORT SUMMARY

**Account**: Salesperson Account (Rehman — `rehman@bluerhine.com`)

---

## Page Name: Sales-Review Queue

### Route: /sales/tasks

#### Network Findings

| Metric | Result |
| :--- | :--- |
| Total API Calls | ~5 unique on first load (~6–7 with Strict Mode / remount duplicates) |
| Duplicate API Calls | `/tasks?salesQueue=true` often ×2; `ws-token` ×1–2 via Navbar |
| Failed Requests | 0 |
| Slow Requests (>1 sec) | 0 (`salesQueue` ~350–500ms) |
| WebSocket | `ws-token` via Navbar; live socket may connect on `/dashboard` |
| Page Load Time | Document ~0.5–0.8s; interactive ~1.2–1.8s (warm); queue payload small (~3.2KB / 2 rows this run) |

#### Issues Found

| ID | Issue | Category | Severity | Impact | Recommendation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| SQ-01 | Hardcoded `limit=500` on sales queue | Data / Perf | High | Over-fetch risk as queue grows; hides overflow past 500 | Server pagination (50–100); queue-scoped default |
| SQ-02 | `/tasks?salesQueue=true` can fire twice on mount | Network | High | Doubles DB work for primary list | Single-flight / abort; fix remount double-fetch |
| SQ-03 | Catch swallows errors → empty “No tasks” | Frontend / UX | High | Failures look like empty queue | Error toast + Retry; distinguish empty vs error |
| SQ-04 | Notifications list + unread-count on critical path | Network | Medium | Extra ~15KB + RTT with every entry | Defer after queue rows paint; combine endpoints |
| SQ-05 | Dual/extra `ws-token` from layout + remounts | WebSocket | Medium | Auth noise; unstable realtime lifecycle | One shared socket singleton |
| SQ-06 | "Loading session…" / role-gate `return null` blank frame | Frontend | Medium | Extra blank before table skeleton | Keep shell + skeleton while authorizing |
| SQ-07 | `lockPrimaryNav` passed but ignored by Navbar | Frontend | Low | Dead prop; confusing for future nav locks | Wire prop or remove |
| SQ-08 | Client search only (good) but no explicit empty-state for zero matches vs zero queue | Frontend / UX | Low | Mild confusion when filtering | Distinct “no matches” copy |

---

## Page Name: Sales-Review History

### Route: /sales/tasks (History mode)

#### Network Findings

| Metric | Result |
| :--- | :--- |
| Total API Calls | Same shell as Queue + `GET /tasks?limit=500&salesHistory=true` on toggle |
| Duplicate API Calls | History fetch can ×2 under Strict Mode / remount |
| Failed Requests | 0 |
| Slow Requests (>1 sec) | 0 (`salesHistory` ~466–534ms; ~42KB / 27 rows this run) |
| WebSocket | Same Navbar token path as Queue |
| Page Load Time | Mode switch ~0.5–1.0s additional after Queue shell already warm |

#### Issues Found

| ID | Issue | Category | Severity | Impact | Recommendation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| SH-01 | Hardcoded `limit=500` on history | Data / Perf | High | History discovery also capped in backend id lookup; scale risk | Paginate history; cursor by reviewedAt |
| SH-02 | Full history refetch on every Queue↔History toggle | Network | Medium | Re-pays ~40KB+ when switching modes | Cache both modes for session; invalidate on refresh |
| SH-03 | Errors collapse to empty history list | Frontend / UX | High | Silent failure | Error banner + Retry |
| SH-04 | Notifications already loaded still on critical path of first open | Network | Low | Contends if user lands directly in History after cold start | Defer layout notifications |
| SH-05 | No server-side search; client filter only after full fetch | Network / UX | Medium | Acceptable at 27 rows; costly if history grows to hundreds | Debounced server search when volume grows |
| SH-06 | Table skeleton good; no virtualization | Frontend | Low | Fine now; jank risk later | Virtualize when row count ≫ 100 |

---

## Page Name: Sales-projects-list

### Route: /sales/projects-list

#### Network Findings

| Metric | Result |
| :--- | :--- |
| Total API Calls | ~5 unique (~6–7 with duplicates) |
| Duplicate API Calls | `projects-list` can ×2 (page reset + debounced query); `ws-token` ×1–2 |
| Failed Requests | 0 |
| Slow Requests (>1 sec) | 0 this run (`projects-list` ~185–210ms; ~59KB / 100 rows; total ERP set **7956**) |
| WebSocket | Navbar `ws-token`; live socket not always observed as Resource |
| Page Load Time | Document ~0.6s; interactive ~1.5–2.2s |

#### Issues Found

| ID | Issue | Category | Severity | Impact | Recommendation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| SP-01 | `projects-list` called twice on load / search path | Network | High | 2× ERP + COUNT for 7956-row universe | Singleflight / abort; atomic page+query update |
| SP-02 | No skeleton / spinner / error UI | Loading UX | High | Blank → sudden data; silent fail | Skeleton + error toast |
| SP-03 | Sales Person shows literal `"null"` (100 cells this page) | Data / UX | High | Looks broken across full first page | Treat null/empty as — / Unassigned |
| SP-04 | `setPage(1)` + fetch deps can double-fetch | Network | Medium | Extra calls when searching from page > 1 | Combine page reset with debounced query |
| SP-05 | Notifications + unread as two calls | Network | Medium | Extra RTT on every page | Combine endpoints |
| SP-06 | Dual WebSocket connect in dev / remount | WebSocket | Medium | Extra tokens / handlers | Singleton socket |
| SP-07 | `COUNT(*)` over full join for 7956 | Backend | Medium | Latency under ERP load | Lighter count query / cache total |
| SP-08 | API lacks Sales/HOD role guard (`JwtAuthGuard` only) | Security | Medium | Any authenticated JWT can call ERP list | Add role / scope guard |
| SP-09 | Authorized gate returns null | Loading UX | Low-Medium | Extra blank frame | Keep shell + skeleton |
| SP-10 | Search debounce 300ms present (good) but still races page reset | Network / UX | Medium | Residual duplicate storms | Stabilize effect deps |

---

## Page Name: Sales-design-list

### Route: /sales/design-list

#### Network Findings

| Metric | Result |
| :--- | :--- |
| Total APIs (unique) | 6–7 |
| Total calls observed | ~8–12 (with duplicates) |
| Duplicate APIs | `/tasks` ×2, `ws-token` ×2 (+ notifs often ×2) |
| Slow / Medium APIs | `/tasks?limit=500` ~538–983ms / ~160KB (109 rows unscoped); unused `/design-list` ~324–398ms / **~273KB** (500 ERP rows) |
| Failed Requests | 0 |
| WebSocket | Navbar + `useTaskLifecycleRefresh` → dual `ws-token` / dual sockets common |
| Page Load Time | Document ~0.6–1.0s; interactive ~2.0–3.5s under ERP + tasks contention |

#### Issues Found

| ID | Issue | Category | Severity | Impact | Recommendation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| SD-01 | Hardcoded `limit=500`, `page=1` on `/tasks` | Data / Perf | Critical | Over-fetch; hides tasks >500; heavy DOM | Server pagination page size 50–100 |
| SD-02 | Unused GET `/design-list` (~273KB) via `DesignListProvider` | Network / Arch | Critical | Full ERP join wasted; DesignListScreen does not use store rows | Do not `shouldLoadDesignList` for `/sales/design-list` |
| SD-03 | Sales `/tasks` **unscoped** (no `salesQueue` / project filter) | Security / Data | Critical | Sales sees **all** tasks (~109 / full catalog this run) | Scope Sales design-list to owned/relevant projects or review statuses |
| SD-04 | `/tasks` fetched twice | Network | High | 2× DB load, slower TTI | Singleflight / abort |
| SD-05 | Dual WebSocket connections | WebSocket | High | Dup tokens + notif/list refresh | One shared socket |
| SD-06 | Search without debounce | Network | High | Request storms while typing | Debounce 300–500ms |
| SD-07 | Notifications list + count (+ often dup) | Network | Medium | Extra RTTs | Combine; one socket |
| SD-08 | Brief blank before skeleton (role gate `null`) | Loading UX | Low-Medium | Flash | Keep shell while authorizing |
| SD-09 | Board view: many status columns × up to 500 cards | Frontend | Medium | Scroll/jank risk | Virtualize columns/cards |
| SD-10 | ERP BU mapping warn spam (shared backend) | Backend | Low | Log noise / CPU | Map codes or rate-limit logs |
| SD-11 | Reallocation tab loads pending-approvals (good lazy) but shares dual-socket path | Network | Low | Extra work when tab opened | Keep tab-scoped; reuse singleton WS |

---

## Page Name: Sales-project-design

### Route: /sales/project-design

#### Network Findings

| Metric | Result |
| :--- | :--- |
| Total API Calls | ~5 unique (~6 with dups) |
| Duplicate API Calls | `/design-list` may skip if already loaded from design-list; else one full ERP pull; `ws-token` ×1–2 |
| Failed Requests | 0 |
| Slow Requests (>1 sec) | 0 this run (`/design-list` ~324–398ms / ~273KB / 500 items) |
| WebSocket | Navbar only (hub has no page socket) |
| Page Load Time | Document ~0.6s; interactive ~1.5–2.5s when ERP cold; faster if store warm |

#### Issues Found

| ID | Issue | Category | Severity | Impact | Recommendation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| SPD-01 | Unpaginated `/design-list` FETCH 500 + multi-join ERP | Backend / Network | Critical | Dominates hub cost; fixed 500 ceiling | Paginated projects API; field pruning |
| SPD-02 | Hub has no direct fetch — always pays provider ERP load | Network / Arch | High | Cannot open hub lightly | Dedicated slim retail/project catalog for hub |
| SPD-03 | Stale `loadedRef` if user visited design-list first | Frontend | Medium | Hub may show stale ERP snapshot until refresh | TTL / soft invalidate; refresh control |
| SPD-04 | API lacks role decorator | Security | Medium | Any JWT can pull ERP design-list | `@Roles` for HOD/Sales (as intended) |
| SPD-05 | Notifications on critical path | Network | Low | Competes with ERP fetch | Defer after category panels paint |
| SPD-06 | "Loading session…" / text loading only | Frontend | Medium | Weak perceived performance | Card/grid skeleton |
| SPD-07 | Client-only search (no network debounce needed) | Frontend | Low | OK at 500; filter cost grows | Virtualize lists per category |
| SPD-08 | First local compile of route (dev cold) can inflate open time | Frontend | Low | QA timing noise | Measure warm loads for baselines |

---

## Page Name: Sales-projects-overview

### Route: /sales/projects-overview

#### Network Findings

| Metric | Result |
| :--- | :--- |
| Total API Calls | 7–9 on first load (+ polls ~45s) |
| Duplicate API Calls | `projects-overview` ×2 common; `ws-token` ×2 (Navbar + page `connectDashboardRealtime`) |
| Failed Requests | 0 |
| Slow Requests (>1 sec) | Occasional under contention (overview ~572–762ms this run / ~15KB; HOD runs saw up to ~1.4s) |
| WebSocket | `ws-token` ×2; page expects live refresh + HTTP poll fallback |
| Page Load Time | Document ~0.8s; interactive ~2.0–2.5s; settle ~3–4s with dups |

#### Issues Found

| ID | Issue | Category | Severity | Impact | Recommendation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| SO-01 | `dashboard/projects-overview` called twice on load | Network | Critical | Doubles heaviest dashboard work; delays interactivity | Ensure single fetch per week; dedupe concurrent requests |
| SO-02 | Overview API medium-slow (~0.5–0.8s+); blocks sections | Backend | High | Blocks all dashboard cards | Optimize query; slim payload; index/cache by weekStart |
| SO-03 | Duplicate payload waste when ×2 | Network / Backend | High | Extra bandwidth + parse cost | Eliminate duplicate; field pruning |
| SO-04 | `ws-token` fetched twice; dual sockets | Network | Medium | Auth noise; competing refresh handlers | Single shared token/socket lifecycle |
| SO-05 | "Loading session…" blank before dashboard | Frontend | Medium | Weak perceived performance | Skeleton for tables + inbox + summary cards |
| SO-06 | Notifications (~14.6KB) on critical path | Network | Low | Competes with overview fetch | Defer until after dashboard paint |
| SO-07 | Separate notifications list + unread-count | Network | Low | Extra round-trip | Combine or derive count from list |
| SO-08 | Large in-scope task sections packed into one response | Backend | Medium | Payload/query cost grows with volume | Paginate section lists; summary counts vs full rows |
| SO-09 | 45s poll + WS refresh both active | Network | Medium | Ongoing traffic while idle | Prefer push; lengthen conditional poll |
| SO-10 | Sales shares HOD inbox approval powers (`hasDepartmentManagerAccess`) | Security / Product | Medium | Confirm intended Sales approval scope | Explicit Sales inbox permissions; audit actions |
| SO-11 | First local route compile (dev cold) inflates QA timing | Frontend | Low | Measure warm loads for baselines | — |

---

## Page Name: Sales-chatter

### Route: /chatter

#### Network Findings

| Metric | Result |
| :--- | :--- |
| Total API Calls | ~15–20 (shared Chatter bootstrap; Sales same client as HOD/Designer) |
| Duplicate API Calls | 5 groups (Posts / Mentions / Commented up to 3–4×; `mention-users` ×2; `ws-token` ×2) |
| Failed Requests | 0 |
| Slow Requests (>1 sec) | 0 (`chatter-posts?limit=50` ~208–369ms / ~48KB / 41 posts this run) |
| WebSocket | `ws-token` ×2; live socket often not observed — relies on HTTP refetch |
| Page Load Time | Document ~1.5–5s (shell); APIs settle ~3–7.5s under duplicate waves |

#### Issues Found

| ID | Issue | Category | Severity | Impact | Recommendation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| SC-01 | Main chatter feeds fetched up to 3–4× on open | Network | Critical | ~48KB × N wasted; delays settle | Single-flight fetch; stop remount/refetch loops |
| SC-02 | `POST /seen` triggers full feed reload | Network | High | Extra large GETs after paint | Update local seen state; avoid full refetch |
| SC-03 | Private mention/comment feeds loaded on Posts tab | Network | High | Unnecessary work for inactive tabs | Fetch tab-scoped data only |
| SC-04 | `chatter-posts?limit=50` ~48KB payload | Backend | High | Heavy parse/render cost | Smaller page size; cursor pagination; slim fields |
| SC-05 | `mention-users` + `ws-token` duplicated | Network | Medium | Extra round-trips | Session-level cache / single socket auth |
| SC-06 | "Loading session…" blank state | Frontend | Medium | Weak perceived performance | Feed skeleton while session resolves |
| SC-07 | Dense post list (~41 cards / ~1k+ nodes) | Frontend | Medium | Scroll/jank risk | Virtualize feed; lazy comments |
| SC-08 | Notifications on critical path (~14.6KB) | Network | Low | Competes with feed load | Defer after first posts paint |
| SC-09 | No observed live WebSocket despite tokens | Network | Medium | Relies on costly refetch instead of push | Validate realtime path; avoid blind polling |
| SC-10 | Sales mention/comment feeds empty this run but still fetched | Network | Medium | Pays Private bootstrap cost for empty UX | Lazy-load Private on tab open |

---

## Page Name: Sales-chatter private

### Route: /chatter?tab=private

#### Network Findings

| Metric | Result |
| :--- | :--- |
| Total API Calls | ~13–15 |
| Duplicate API Calls | 5 groups (Posts / Mentions / Commented up to ×3; `mention-users` / `ws-token` ×2) |
| Failed Requests | 0 |
| Slow Requests (>1 sec) | 0 (mention/comment filters fast when empty; Posts still ~48KB) |
| WebSocket | `ws-token` ×2; no reliable live socket |
| Page Load Time | Document ~1.4–2.9s; interactive ~2.5–4.1s |

#### Issues Found

| ID | Issue | Category | Severity | Impact | Recommendation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| SCP-01 | Private tab still loads full Posts feed (`limit=50`) | Network | High | ~48–96KB unused when Private-focused | Fetch Private-scoped APIs only |
| SCP-02 | Mention feed fetched multiple times | Network | High | Extra latency under remount loops | Deduplicate single-flight |
| SCP-03 | Commented-by feed fetched multiple times | Network | High | Triples repeated DB work | Same dedupe as mentions |
| SCP-04 | Shared bootstrap ignores `?tab=private` | Network / Frontend | High | Same cost pattern as default Chatter | Load active-tab feed first |
| SCP-05 | `mention-users` + `ws-token` duplicated | Network | Medium | Extra auth/bootstrap cost | Session cache |
| SCP-06 | "Loading session…" before Private panels | Frontend | Medium | Blank perceived load | Skeleton for Mentioned/Comments sections |
| SCP-07 | Notifications loaded with Private bootstrap | Network | Low | Non-critical path contention | Defer layout notifications |
| SCP-08 | `limit=200` on mention/comment queries | Backend | Low | Over-fetch if lists grow | Paginate private lists |
| SCP-09 | No live WebSocket observed | Network | Medium | Falls back to duplicate HTTP loads | Prefer push updates for mentions |

---

## Page Name: Sales-chatter task updates

### Route: /chatter?tab=task-updates

#### Network Findings

| Metric | Result |
| :--- | :--- |
| Total API Calls | ~13 |
| Duplicate API Calls | 5 groups ×2 (Posts, Mentions, Commented, `mention-users`, `ws-token`) |
| Failed Requests | 0 |
| Slow Requests (>1 sec) | 0 |
| WebSocket | `ws-token` ×2; no live Socket.IO reliably observed |
| Page Load Time | Document ~1.5–2.4s; interactive ~2.3–3.3s |

#### Issues Found

| ID | Issue | Category | Severity | Impact | Recommendation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| SCT-01 | Task Updates loads Posts + Private feeds | Network | High | Wasted ~20–96KB and extra DB work | Tab-scoped data loading |
| SCT-02 | All chatter bootstrap APIs duplicated ×2 | Network | High | Doubles open cost | Singleflight / dedupe |
| SCT-03 | Uses full posts payload (~48KB ×2) for grouped list | Backend / Frontend | High | Over-fetch for summary UI | Dedicated task-updates summary API |
| SCT-04 | Medium-latency concurrent chatter calls | Backend | Medium | Slows first interactive paint | Reduce concurrency via dedupe; optimize query |
| SCT-05 | Possible duplicate OP rows in Task Updates list | Frontend | Medium | Confusing UX / extra render work | Deduplicate grouping keys |
| SCT-06 | "Loading session…" blank state | Frontend | Medium | Weak perceived performance | List skeleton |
| SCT-07 | `mention-users` fetched though unused on this tab | Network | Medium | Unnecessary call | Lazy-load only when composing/mentioning |
| SCT-08 | Notifications on critical path | Network | Low | Contends with chatter bootstrap | Defer |
| SCT-09 | `ws-token` ×2 without observed socket | Network | Medium | Auth noise; no push benefit seen | One socket lifecycle |

---

## Page Name: Sales-team-activity

### Route: /sales/team-activity

#### Network Findings

| Metric | Result |
| :--- | :--- |
| Total API Calls | 6 app APIs on first load (+ avatar CDN fan-out); activities continues every ~20s |
| Duplicate API Calls | `activities?limit=100` ×2 on open (then ongoing polls) |
| Failed Requests | 0 core APIs; some avatar-proxy / CDN attempts may show 0 transfer size |
| Slow Requests (>1 sec) | 0 (`activities` ~578–835ms / **~113KB** / 100 rich items) |
| WebSocket | `ws-token` ×1; live socket not observed (HTTP polling used instead) |
| Page Load Time | Document ~1.0–1.4s; first interactive ~2.5–3.5s; ongoing refetch every ~20s |

#### Issues Found

| ID | Issue | Category | Severity | Impact | Recommendation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| STA-01 | `activities?limit=100` called twice on open (~113KB each) | Network | Critical | ~226KB wasted; delays first paint | Singleflight-fetch; dedupe concurrent requests |
| STA-02 | Full activities feed polled every ~20s | Network | Critical | Continuous ~113KB + DB load while page open | Use WebSocket/SSE or incremental sync; longer interval |
| STA-03 | Large activities payload (~113KB / 100 rich items) | Backend | High | Slow parse + heavy render | Smaller page size; slim fields; cursor pagination |
| STA-04 | Renders all ~100 items (~3k DOM / many controls) | Frontend | High | Scroll jank / memory pressure | Virtualize feed; paginate UI |
| STA-05 | No pagination / load-more observed | Frontend / Backend | High | Always pays full list cost | Infinite scroll or paged fetch |
| STA-06 | External avatar CDN fan-out (`ui-avatars.com`) | Network / Security | Medium | Extra latency; third-party dependency; names sent externally | Local initials/SVG; cache by userId |
| STA-07 | Repeated avatar `<img>` for same users | Frontend | Medium | Extra image work / layout cost | Shared avatar component cache |
| STA-08 | "Loading session…" / “Loading…” before feed | Frontend | Medium | Weak perceived performance | Feed skeleton with filter chrome |
| STA-09 | Notifications on critical path | Network | Low | Contends with activities fetch | Defer after feed paint |
| STA-10 | `ws-token` present but polling used | Network | Medium | Missed realtime efficiency | Prefer push events over full refetch |
| STA-11 | Sales activity feed is **global** (same as HOD; not salesperson-scoped) | Security / Product | Medium | Sales may see org-wide activity beyond sales scope | Confirm intent; department / sales-owned filter |
| STA-12 | First local compile (dev cold) inflates first QA open | Frontend | Low | Use warm-load timings for baselines | — |

---

## Cross-cutting findings (Sales module)

| ID | Issue | Category | Severity | Recommendation |
| :--- | :--- | :--- | :--- | :--- |
| SX-01 | Shared HOD screens under `/sales/*` inherit same duplicate-fetch / ERP / chatter defects | Network / Arch | Critical | Fix once in shared components; Sales routes benefit automatically |
| SX-02 | Navbar always loads notifications list + unread-count (+ 45s poll) on every Sales page | Network | Medium | Defer; combine; prefer WS unread badge |
| SX-03 | Role guard `return null` + “Loading session…” causes blank first paint on all Sales routes | Frontend | Medium | Persist chrome; route-level skeletons |
| SX-04 | `DesignListProvider` eagerly loads ERP `/design-list` for `/sales/design-list` and `/sales/project-design` | Network | Critical | Narrow `shouldLoadDesignList`; avoid unused ERP on tasks list |
| SX-05 | Sales design-list `/tasks` lacks salesperson scoping flags | Security / Data | Critical | Enforce project ownership or sales-relevant statuses server-side |
| SX-06 | WebSocket token fetched per `connectDashboardRealtime` instance (Navbar + page hooks) | WebSocket | High | App-wide singleton dashboard socket |
| SX-07 | Several list APIs use `limit=500` (`/sales/tasks`, `/sales/design-list`) | Data / Perf | High | Paginate everywhere; never hard-cap UX at 500 silently |
| SX-08 | ERP `projects-list` COUNT + join cost (7956) shared with HOD | Backend | Medium | Cache totals; lighter count path |
| SX-09 | No Sales Master Scheduler / leave / OT dedicated IA (by design) — inbox approvals live on overview | Product | Low | Document Sales capability matrix for QA |

---

## Priority remediation order

1. **Stop unused ERP `/design-list` on `/sales/design-list`** and scope Sales `/tasks` (SD-02, SD-03, SX-04, SX-05).
2. **Deduplicate** queue/history, projects-list, overview, activities, and chatter mount fetches (SQ-02, SP-01, SO-01, STA-01, SC-01).
3. **Replace `limit=500`** with real pagination on Sales Review and Design List (SQ-01, SD-01, SX-07).
4. **Fix literal `"null"` cells** on projects-list (SP-03).
5. **Singleton WebSocket** + defer notifications off critical path (SX-02, SX-06).
6. **Team activity**: stop 20s full 113KB refetch; virtualize; confirm Sales visibility scope (STA-02, STA-11).
7. **Chatter tab-scoped loading** for Sales (same as HOD/Designer) (SC-03, SCP-01, SCT-01).

---

## Measurement notes

- API timings above were captured against local API (`localhost:7600`) authenticated as **SALESPERSON** Rehman on **2026-07-31**.
- Duplicate call counts and page interactive timings follow the same patterns measured on shared screens in `HOD_PERFORMANCE_REPORT.md` / `AJ DESIGNER_PERF_REORT.md`, adjusted for Sales routes and Sales-account payloads.
- Sales does **not** expose Master Scheduler, Leave Planner, or Designer Requests tabs in primary nav; reallocation pending approvals are reachable from Design List; leave/OT/regularization approvals surface via Projects Overview inbox when permitted.
