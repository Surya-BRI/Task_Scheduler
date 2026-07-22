# Known Gaps — Not Yet Fixed

Issues surfaced while investigating the leave/overtime scheduler flows (see [SCHEDULER_TIME_MODEL.md](SCHEDULER_TIME_MODEL.md)) and the sign-rows refactor (see [../docs/SIGN-ROWS-ARCHITECTURE.md](../../docs/SIGN-ROWS-ARCHITECTURE.md)). None of these are crashes — they're either a documented architectural gap, a design inconsistency between two similar flows, or stale placeholder data. Listed with a recommended fix so the next person doesn't have to rediscover the reasoning.

---

### 1. `placeOverflowCapacity` doesn't check the destination week's lock state

Also tracked as item 11 in [SCHEDULER_FIXES_NEEDED.md](SCHEDULER_FIXES_NEEDED.md#11-placeoverflowcapacity-doesnt-check-the-destination-weeks-lock-state).

**Issue:** the primary week-save path rejects a `PUT` against a locked week (`isLocked: true`). `placeOverflowCapacity` walks forward into other weeks and creates/upserts `SchedulerAssignment` rows there without checking whether those destination weeks are locked — overflow could silently land in a week that was locked specifically to prevent further edits.

**Recommended fix:** have `placeOverflowCapacity` check each candidate week's `isLocked` flag (same as the primary save path) and skip locked weeks when searching for capacity, reporting any resulting unplaceable hours via `unplacedOverflow` instead of writing into it.

**Files:** `backend/src/scheduler-assignments/scheduler-assignments.service.ts` — `placeOverflowCapacity`

---

### 2. `ProjectCreateTaskModal.jsx`'s sign-type rows are still hardcoded

**Issue:** the 2026-06-28 sign-rows refactor split `ProjectTaskDetail` (task-scoped design-work-hours spec) from `ProjectSignRow` (project-scoped ERP sign register, QS-managed) — see [SIGN-ROWS-ARCHITECTURE.md](../../docs/SIGN-ROWS-ARCHITECTURE.md). The QS sign register UI (`/qs/projects/[id]`) was updated to use the real `ProjectSignRow` model, but `ProjectCreateTaskModal.jsx`'s `SIGN_TYPE_ROWS` constant predates that refactor and is still a hardcoded placeholder list, not fetched from real `ErpTSSignageDetail`/`ProjectSignRow` data.

**Recommended fix:** replace `SIGN_TYPE_ROWS` with a fetch against the project's real sign rows (same data source the QS register screen uses) so task creation reflects actual ERP sign types instead of a fixed placeholder list.

**Files:** `frontend/src/features/projects/components/ProjectCreateTaskModal.jsx` (or wherever `SIGN_TYPE_ROWS` currently lives)

---

### 3. OT-driven task-hold deletes future assignments instead of FIFO-rescheduling them

**Issue:** two different flows remove a designer's future scheduled work, and they behave inconsistently:
- **Leave approval** (`rescheduleForApprovedLeave`) FIFO-pushes every displaced assignment forward to the next day with open capacity — nothing is lost, just moved.
- **OT-driven hold/unassign** (`updateOvertimeRequestSchedulerAction`, the `ON_HOLD` branch) instead runs `schedulerAssignment.deleteMany(...)` on today-forward rows for that task outright. The HOD has to manually re-plan the task afterward.

Same underlying situation (designer loses future capacity for a task) handled two different ways depending on which flow triggered it.

**Recommended fix:** either (a) make the OT-hold path reuse the same FIFO displacement logic leave approval uses, or (b) if delete-then-manually-replan is the intended UX for this specific action (since it's an explicit HOD decision, not an automatic side effect of approving something else), document that distinction explicitly so it doesn't read as an oversight later.

**Files:** `backend/src/scheduler-assignments/scheduler-assignments.service.ts` — `updateOvertimeRequestSchedulerAction` vs `rescheduleForApprovedLeave`

---

### ~~4. The 8h/12h daily ceiling is enforced only in frontend rendering, not the backend~~ — FIXED

**Was:** the OT service enforced a **24h/week** cap server-side at request-approval time (`overtime-requests.service.ts`), but the **8h regular / 12h max-with-OT** daily ceiling described in [SCHEDULER_TIME_MODEL.md](SCHEDULER_TIME_MODEL.md) existed only as display math in `designerDashboardSync.js` (`MAX_DAILY_HOURS` truncation). Nothing on the backend rejected persisting, e.g., 15h of combined regular + approved-OT hours on a single day.

**Fix:** two symmetric server-side checks, both enforcing `regularHours + approvedOvertimeHours <= MAX_DAILY_HOURS (12)`:
- `OvertimeRequestsService.review()` — when an HOD approves an OT request (`APPROVED_BY_MANAGER`), `assertDailyCeilingNotExceeded` sums that designer's existing `SchedulerAssignment` hours for the request's date and rejects the approval if adding the approved OT hours would exceed 12h. Only one OT request per designer per day is allowed (existing rule), so this only ever needs to account for the single request being approved.
- `SchedulerAssignmentsService.validateAssignments()` — now takes an optional `approvedOvertimeHoursByDesignerDay` map; `saveWeekSnapshot` queries `APPROVED` overtime requests for the week being saved and folds each designer/day's approved OT hours into the existing per-day capacity check, so regular assignments can no longer be saved on top of already-approved OT past the 12h ceiling either.

**Files:** `backend/src/overtime-requests/overtime-requests.service.ts` — `assertDailyCeilingNotExceeded`; `backend/src/scheduler-assignments/scheduler-assignments.service.ts` — `validateAssignments`, `saveWeekSnapshot`

---

### 5. FIFO partial-work handoff logic lives in `tasks.service.ts`, not the scheduler service

**Issue:** [SCHEDULER_TIME_MODEL.md](SCHEDULER_TIME_MODEL.md) describes FIFO partial-work handoff (peek → FIFO-allocate → freeze/pause draft session) as scheduler behavior, but the actual freeze/allocate logic (`freezeDraftWorkSession`) lives in `tasks.service.ts`, invoked via `POST /tasks/:id/freeze-draft-session`. `scheduler-assignments.service.ts` only exposes peeked `Draft`/`HandedOff` `TaskWorkSession` seconds (`workedHours` on assignment rows) so the frontend can compute FIFO remainders before a drag — it doesn't do any FIFO math or session freezing itself.

This isn't broken, just architecturally split from where the docs (and a new reader) would expect to find it.

**Recommended fix:** no functional change needed. Either move `freezeDraftWorkSession` into `scheduler-assignments.service.ts` for locality with the rest of the scheduler-reaction logic, or update `SCHEDULER_TIME_MODEL.md` to explicitly point at `tasks.service.ts` as the real home of this logic so the split is documented rather than surprising.

**Files:** `backend/src/tasks/tasks.service.ts` — `freezeDraftWorkSession`; `backend/src/scheduler-assignments/scheduler-assignments.service.ts` — `workedHours` peek only
