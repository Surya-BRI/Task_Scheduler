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

## Not yet done

### 4. No retention/purge policy for `SchedulerAssignmentHistory`

Every save writes a full before/after JSON snapshot to `SchedulerAssignmentHistory`, forever. No cron job, no archival, no deletion.

**Fix:** a scheduled delete of rows older than N months. Technically simple — the blocker is that the retention period is a business/compliance decision (audit requirements may dictate a minimum retention), not something to pick unilaterally. Needs an answer from whoever owns audit/compliance requirements before writing the actual query.

---

### 5. Whole-week replace instead of incremental/per-cell saves

`saveWeekSnapshot` (`scheduler-assignments.service.ts`) does a full `deleteMany` + `createMany` of *all* assignments for the week on every single `PUT`, even when only one task moved. Combined with the optimistic-concurrency version check, this means:

- Two people editing the *same week* concurrently will hit version conflicts more often as more people edit it at once.
- Every conflict discards the loser's edit entirely and forces a reload + redo — not a merge.

This doesn't scale past a handful of people actively editing the same week simultaneously. Fixing it means moving to per-cell/incremental saves — a genuine architecture change to the core save path, not a small patch. Worth doing if concurrent same-week editing becomes a frequent pain point in practice.

---

### 6. Cross-week split-index recompute has no time bound

The recompute in `saveWeekSnapshot` (for tasks split across weeks) queries `SchedulerAssignment` for a task across *every week that ever existed*. It's now backed by an index (`IX_ErpTSSchedulerAssignment_task_week`, added during the disappearing-tasks investigation), so it's an efficient seek rather than a scan — but it's still unbounded by time range. As total history grows over years, this specific query's cost grows with it.

**Fix:** bound the lookback/lookahead to a rolling window of weeks instead of "all time," if/when history actually grows large enough for this to matter. Low urgency now that it's indexed.
