# Scheduler Fixes — Status

Architectural/scalability items found while investigating [SCHEDULER_DISAPPEARING_TASKS_ISSUE.md](SCHEDULER_DISAPPEARING_TASKS_ISSUE.md). The disappearing-tasks bug is fully resolved and documented separately.

---

## Completed

### 1. Sidebar backlog no longer capped at 500 tasks

**Was:** `fetchQueueRecords` called `GET /tasks?limit=500`. Once active task count exceeded 500, tasks beyond the cutoff silently stopped appearing in the sidebar/backlog.

**Fix (Phase 1):** dedicated `GET /tasks/scheduler-queue` endpoint (HOD only) returns only schedulable backlog rows — unassigned + `ON_HOLD`, excluding completed — with no arbitrary 500 cap.

**Files:**
- `backend/src/tasks/scheduler-task-summary.util.ts` — shared slim select + `schedulerQueueWhere()`
- `backend/src/tasks/tasks.controller.ts` / `tasks.service.ts` — `scheduler-queue` route
- `backend/src/scheduler-assignments/scheduler-assignments.service.ts` — `attachTaskSummaries()` embeds `row.task` on week rows
- `frontend/src/features/scheduler/services/scheduler-queue.api.ts` — `fetchSchedulerQueue()`
- `frontend/src/features/scheduler/components/DesignSchedulerScreen.jsx` — mount + week load use split fetches

---

### 2. Realtime events now carry deltas

**Was:** every `notifyOverviewRefresh(...)` broadcast only an event name (e.g. `'scheduler_week_saved'`). Clients had to re-fetch everything and diff locally.

**Fix:** `DashboardRefreshPayload` extended with `weekStart`, `version`, `updatedBy`, `changedTaskIds`, `affectedWeekStarts`, `taskId`, `status`. Emit sites in `scheduler-assignments.service.ts`, `tasks.service.ts`, `requests.service.ts`, `regularization-requests.service.ts`, and `overtime-requests.service.ts` thread through what they already compute.

**Frontend:** `DesignSchedulerScreen.jsx` uses version gating to skip reload on the saving tab, reloads grid only when the event touches the viewed week, and patches queue state on single-task events.

**Files:**
- `backend/src/dashboard/dashboard-realtime.service.ts`
- `frontend/src/lib/realtime.ts` — payload types
- `frontend/src/features/scheduler/components/DesignSchedulerScreen.jsx` — delta handler

---

### 3. Sidebar staleness across tabs / background tabs

**Was:** after Phase 1, `reloadWeek()` reused a cached `queueRecordsRef` snapshot (fetched once at mount) instead of re-running `GET /tasks/scheduler-queue` on every reload. The sidebar renders from `tasks` state filtered by `unassigned` / `ON_HOLD`, but remote updates only patched `queueRecords` — so another HOD assigning a task from the backlog would not remove it from this tab's sidebar until a full page refresh.

**Example (before):**
1. Tab A and Tab B both open the scheduler; both show **"Signage Rev A"** under Unassigned.
2. Tab A drags it onto a designer and saves.
3. Tab B's grid might update, but **"Signage Rev A" stayed in Unassigned** — stale.

**Fix:**
- `syncSidebarTasksFromQueue()` merges authoritative queue rows into `tasks` without touching grid placements; removes cards that left the backlog (assigned/completed elsewhere).
- `refreshSidebarQueue()` refetches `/tasks/scheduler-queue` then syncs sidebar state.
- Realtime handler always refreshes sidebar on scheduler events (backlog is week-independent); refetches queue **before** grid reload to avoid a race.
- Task status / reassign / complete events refetch the full queue instead of patching only `queueRecords`.
- Tab `visibilitychange` refreshes sidebar when the tab becomes visible again.
- `pendingQueueRefreshRef` flushes a deferred sidebar refresh after an in-flight save completes.

**Example (after):** same two-tab scenario — Tab B removes **"Signage Rev A"** from Unassigned immediately when Tab A saves, no manual refresh.

**Files:**
- `frontend/src/features/scheduler/components/DesignSchedulerScreen.jsx` — `buildSidebarTaskFromQueueRecord`, `syncSidebarTasksFromQueue`, `refreshSidebarQueue`, realtime + visibility handlers

---

### 4. Cross-week overflow carry-forward moved server-side

**Was:** "Assign Available Only" overflow fragments were carried to next week via a client-side `localStorage` key (`scheduler_overflow_v1_YYYY-MM-DD`), restored on next-week load and placed at the first day with capacity — fragile (lost if browser storage was cleared) and never validated against the destination week's actual live state.

**Fix:** `SaveSchedulerWeekDto.overflow[]` plus a new backend `placeOverflowCapacity` place overflow atomically with the week save: walks forward day-by-day (skipping weekends/holidays/full-day leave), live-checks real capacity inside the same save transaction, bounded by a 56-day lookahead. The response returns `overflowPlacements`/`unplacedOverflow` so nothing is silently dropped.

**Files:**
- `backend/src/scheduler-assignments/dto/save-scheduler-week.dto.ts` — `SchedulerOverflowInputDto`
- `backend/src/scheduler-assignments/scheduler-assignments.service.ts` — `placeOverflowCapacity`
- `frontend/src/features/scheduler/components/DesignSchedulerScreen.jsx` — `buildPreparedDropAssignment`, `pendingOverflowRef`
- `frontend/src/features/scheduler/services/scheduler-assignments.api.ts`

---

### 5. Stale-consolidation guard for whole-task Unassign/Hold

**Was:** dragging a split task's part to Unassigned or Hold deleted **all** sibling assignment rows across all weeks unconditionally — including any part scheduled into a week the caller never loaded (e.g. created by another tab/session between the caller's last reload and this action).

**Fix:** callers may now pass `expectedAssignmentIds` (the ids they believe are still live) to `DELETE /scheduler-assignments/task/:taskId` and `PATCH /tasks/:id/status` (ON_HOLD); if the server finds a live row outside that set, it rejects with `ConflictException` instead of deleting it, and the frontend reloads the week on conflict. Omitting the param preserves the old unconditional-wipe behavior (`TaskDetailsPage.jsx`'s own Hold button still omits it intentionally — see items 9 and 10 below for two gaps found in this guard).

**Files:**
- `backend/src/scheduler-assignments/scheduler-assignments.service.ts` — `clearTaskSchedule` (transactional check+delete)
- `backend/src/tasks/tasks.service.ts` — `updateStatus` ON_HOLD path
- `frontend/src/features/scheduler/components/DesignSchedulerScreen.jsx` — `commitPanelDrop`, `handleStaleConsolidationConflict`

---

### 10. False-positive conflict from stale `assignmentRowId`

**Was:** `assignmentRowId` on frontend task objects was populated only from the initial ERP week load and never refreshed after save. Every save does `deleteMany` + `createMany`, which replaces assignment row ids. Same-session Unassign/Hold then sent a stale or empty `expectedAssignmentIds` set (and empty `[]` still opted into the guard because it is truthy in JS), so the backend rejected with a false "Another scheduled part of this task changed" conflict.

**Fix:**
- After each successful week save, map returned assignment row ids back onto matching frontend cards (`applyAssignmentMetaFromRows`) and update a synchronous `assignmentRowIdByFrontendIdRef` so Unassign/Hold does not race React state.
- Rebuild that ref on week reload from ERP.
- Omit `expectedAssignmentIds` entirely when no reliable ids are known (`clearTaskFromSchedule` treats empty arrays as omit).

**Files:**
- `frontend/src/features/scheduler/components/DesignSchedulerScreen.jsx`
- `frontend/src/features/scheduler/services/scheduler-assignments.api.ts`

---

### 9. Stale-consolidation guard's `tasks.service.ts` path is transactional

**Was:** `SchedulerAssignmentsService.clearTaskSchedule` wraps its expected-ids check and the delete in one `$transaction`. `TasksService.updateStatus`'s equivalent ON_HOLD guard did not — the `findMany` check, `task.update()`, and the later unconditional `schedulerAssignment.deleteMany` were three separate, non-transactional Prisma calls. A sibling assignment created in that window could still be silently deleted even though the guard "passed."

**Fix:** ON_HOLD path now runs the optional expected-ids check, `task.update`, and `schedulerAssignment.deleteMany` inside a single `$transaction`, matching `clearTaskSchedule`.

**Files:**
- `backend/src/tasks/tasks.service.ts` — `updateStatus` ON_HOLD path

---

### 6. SchedulerAssignmentHistory retention purge

**Was:** every week save appended a before/after JSON snapshot to `SchedulerAssignmentHistory` forever — no cron, no archival, no delete.

**Before example:** after a year of daily HOD edits, the history table keeps growing without bound (millions of large JSON rows).

**Fix:** daily cron (`15 3 * * *` UTC) deletes rows older than `SCHEDULER_HISTORY_RETENTION_MONTHS` (default **18**). Set to `0` to disable. Index `IX_ErpTSSchedulerAssignmentHistory_createdAt` supports the purge.

**After example:** on 14 Jul 2027, rows with `createdAt` before 14 Jan 2026 are deleted overnight; recent months stay available for incremental concurrent-edit merge.

**Files:**
- `backend/src/scheduler-assignments/scheduler-assignments.service.ts` — `purgeExpiredAssignmentHistory` + cron
- `backend/prisma/schema.prisma` / `prisma/sql/add-scheduler-history-createdAt-index.sql`
- `backend/.env.example` — `SCHEDULER_HISTORY_RETENTION_MONTHS`

---

### 7. Incremental week saves (not full-board replace on every edit)

**Was (original gap):** every `PUT` rewrote *all* assignments for the week (`deleteMany` + `createMany`), so two HODs editing different tasks on the same week collided on version and one lost their work.

**Before example:** Alex moves Task A; Ben moves Task B at the same time → version conflict → Ben must refresh and redo, even though the tasks never overlapped.

**Fix (already in place; tightened here):**
- Frontend sends `affectedTaskIds` + only those assignment rows.
- Backend replaces only those task rows; if versions differ but history shows no overlapping task ids, the save merges.
- **New:** no-op flushes (nothing moved, no overflow/fragments) skip the PUT entirely — no accidental full-week rewrite.

**After example:** Alex saves Task A (incremental). Ben’s Task B save sees a newer week version but history proves Task B was untouched → Ben’s save succeeds without refresh.

**Files:**
- `frontend/.../DesignSchedulerScreen.jsx` — `computeAffectedTaskIds`, no-op skip
- `backend/.../scheduler-assignments.service.ts` — `isIncrementalSave` / overlap merge

---

### 8. Cross-week split-index recompute is time-bounded

**Was:** renumbering split parts queried *every* `SchedulerAssignment` row for that task across all weeks forever.

**Before example:** a task last touched in 2023 still forces a full historical scan on every 2026 save that mentions it.

**Fix:** only peer parts within ±`SCHEDULER_SPLIT_RECOMPUTE_WEEK_WINDOW` weeks (default **26**, ~6 months each side) are loaded for renumbering.

**After example:** saving July 2026 only considers peers roughly Jan 2026–Jan 2027; older dormant weeks are ignored.

**Files:**
- `backend/src/scheduler-assignments/scheduler-assignments.service.ts` — `splitRecomputeWeekBounds`
- `backend/src/config/configuration.ts` — `scheduler.splitRecomputeWeekWindow`

---

## Not yet done

### 11. `placeOverflowCapacity` doesn't check the destination week's lock state

The primary week-save path rejects a `PUT` against a locked week (`isLocked: true`). `placeOverflowCapacity` (item 4 above) walks forward into other weeks and creates/upserts `SchedulerAssignment` rows there without checking whether *those* destination weeks are locked — an overflow placement could silently write into a week that was locked specifically to prevent further edits.

**Fix:** have `placeOverflowCapacity` check each candidate week's `isLocked` flag (same as the primary save path) and skip locked weeks when searching for capacity, reporting any resulting unplaceable hours via `unplacedOverflow` instead.
