# Scheduler "Disappearing Tasks" & Performance Issue — RESOLVED

**Root cause:** an access-scoping bug introduced 2026-07-03 silently limited an HOD's "give me the whole week" fetch to only their own rows. Everything else fixed in this pass was real, but was not the cause of the reported symptom.

---

## What Was the Problem

Dragging a task onto a designer appeared to save successfully (toast, correct optimistic UI, correct `PUT` response), but after a page reload or navigation the task would be gone — back in Unassigned, or simply missing from the grid — while the logged-in HOD's own overtime/leave/regularization blocks always rendered fine.

Separately, the scheduler felt slow and "chatty": every drag triggered reloads across every open tab, individual `GET`/`PUT` requests were taking multiple seconds, and one `PUT` was observed taking 17.5s.

---

## Root Cause

`GET /scheduler-assignments?weekStart=...` (no `designerId` param — the scheduler's normal "load the whole week" call) is scoped through `resolveDesignerScope()`:

```ts
const effectiveId = trimmed || callerId;
```

No `designerId` requested → defaults to the **caller's own id**, for every role, including HOD. This was introduced in commit `6f0d534` ("feat: integrate throttling and enhance security measures", 2026-07-03) as part of a broader security-hardening pass — almost certainly intended to stop a plain `DESIGNER` from viewing other designers' schedules, but it wasn't branched by role, so it also silently scoped the HOD's own "see everyone" fetch down to just their own rows.

**Why it took 5 days to notice:** while actively dragging tasks, the grid renders from local optimistic state, never refetched from the server. The bug only surfaces on an actual reload (mount, hard refresh, navigation) — which is why the specific bug reports only showed up when the investigation kept forcing real reloads to happen.

**Verification method:** for every reported case (`OP-48547`, `OP-57940`, `OP-58883`), a direct DB query confirmed the `SchedulerAssignment` row was correctly and durably saved, with `SchedulerAssignmentHistory` showing no subsequent save ever touched it — ruling out an overwrite and pointing at the read path instead.

## Fix

`backend/src/scheduler-assignments/scheduler-assignments.controller.ts` (`findForWeek`): when the caller has department-manager access (HOD) **and** no `designerId` was explicitly requested, pass `undefined` (no filter — see everyone) instead of routing through `resolveDesignerScope`'s default-to-self behavior. An explicit `designerId` request, or a plain `DESIGNER` caller, still goes through the existing access check unchanged.

Deliberately fixed locally in this controller, not in the shared `resolveDesignerScope` utility — that utility is also used by `overtime-requests` and `regularization-requests`, where "default to self when unspecified" may be intentional (e.g. a "my requests" page), and changing it globally risked altering those endpoints' behavior without separately verifying them.

---

## Other Real, Independent Bugs Fixed Along the Way

These were genuine bugs found by reading the actual code paths — not artifacts of the scoping bug above — and remain valid fixes:

| Bug | File | Fix |
|---|---|---|
| Reload race silently clobbering a save | `DesignSchedulerScreen.jsx` (`reloadWeek`) | Guards comparing a save-generation counter, a reload-start sequence number, and the server's own `version` number before applying fetched data — a stale reload now defers instead of overwriting newer local/server state. |
| Split-part unassign/hold wrongly consolidated active siblings | `DesignSchedulerScreen.jsx` (`commitPanelDrop`) | Removed the `assignmentRowId` requirement from the single-part-detach gate — new, not-yet-persisted split parts were incorrectly falling through to whole-task consolidation. |
| Self-triggered reload storm | `DesignSchedulerScreen.jsx` (realtime handler) | The `dashboard:refresh` broadcast (`server.to('overview').emit(...)`) never excluded the sender, so every save reloaded the saving tab too. Removed the socket-triggered reload entirely (`defd237`, 2026-06-18); lock/unlock still syncs directly without a reload. |
| Heavy `/tasks?limit=500` refetch on every reload | `DesignSchedulerScreen.jsx` (`reloadWeek`) | Replaced by Phase 1 split fetch: dedicated `GET /tasks/scheduler-queue` for sidebar backlog + week assignments for grid. Sidebar staleness across tabs later fixed via `refreshSidebarQueue` / `syncSidebarTasksFromQueue` — see [SCHEDULER_FIXES_NEEDED.md](SCHEDULER_FIXES_NEEDED.md) §3. |
| `PUT` doing unnecessary blocking work | `scheduler-assignments.service.ts` (`saveWeekSnapshot`) | Activity logging / notification fan-out (4-6 sequential DB round trips) moved to a fire-and-forget background call (`notifyAfterWeekSave`) instead of blocking the response. `notifyOverviewRefresh` now fires immediately after the transaction commits, not after the slower notification work. |
| Sequential per-assignee-group task updates | `scheduler-assignments.service.ts` (`saveWeekSnapshot`) | Batched the `assignPlannedByDesigner`/`assignOnlyByDesigner` loops (up to 5+ sequential `updateMany` calls) into a single `UPDATE ... CASE WHEN` statement, same pattern already used for `otherWeekUpdates`. Needed explicit `CAST(... AS UNIQUEIDENTIFIER \| NVARCHAR(20))` on every branch — SQL Server can't infer a consistent type across `CASE WHEN` branches when some are `NULL` and others are typed (caused a `P2010` raw-query failure on first attempt). |
| Missing index for cross-week split recompute | `backend/prisma/sql/add-scheduler-assignment-task-index.sql` | Added `IX_ErpTSSchedulerAssignment_task_week` on `[taskId, weekStartDate]` — the recompute's `taskId IN (...) AND weekStartDate != X` query had no index leading with `taskId`, so it scanned a growing share of the table as history accumulated. |
| `/tasks` fetch pulling completed/accepted tasks | `tasks.controller.ts` / `tasks.service.ts` | Added `excludeStatuses` query param (`DESIGN_COMPLETED,CLIENT_ACCEPTED`) applied as `status NOT IN (...)` — these can never legitimately be unassigned/on-hold/schedulable. |

---

## What Was *Not* the Cause (a Detour Worth Recording)

A large portion of this investigation chased a hypothesis that a reload racing an in-flight save was overwriting correctly-saved data on the server. That mechanism is real and was worth guarding against (see the reload-race fixes above), but for every specific case actually traced to a conclusion, the database showed the row was saved correctly and never subsequently touched — the "missing" data in the GET response was explained entirely by the scoping bug, not a race. Lesson: the tell was there from the start — the logged-in user's own rows always rendered, nobody else's ever did — and should have prompted checking authorization/query-scoping earlier.

---

For architectural/scalability items found during this investigation but deliberately not fixed here, see [SCHEDULER_FIXES_NEEDED.md](SCHEDULER_FIXES_NEEDED.md).
