# Scheduler Rules

Single source of truth for how the design scheduler behaves.
If code and these rules conflict, fix the code.

---

## Constants

| Name | Value | Meaning |
|---|---|---|
| `DAILY_CAPACITY` | 8h | Normal working hours per day |
| `MAX_DAILY_HOURS` | 12h | Absolute ceiling — backend rejects any day above this |
| `WEEKDAY_INDICES` | [0,1,2,3,4] | Mon–Fri only (Sat/Sun blocked) |
| `MIN_SPLIT_HOURS` | 5min (0.0833h) | Smallest allowed split part — matches the timer's 5-minute rounding granularity (was 1h) |

---

## Rule 1 — Sequential Fill (No Gaps)

> A designer's days must be filled in order. You cannot assign hours to a later day while an earlier day still has room.

- When a task is dropped onto day N, check if any day < N has `usedHours < 8h`
- If yes → open the redirect dialog (see Rule 12) instead of auto-placing; the HOD chooses between the suggested gap day or pinning the task to the day it was dropped on
- Applies to **all drag sources**: sidebar, ON-HOLD panel, another designer's cell
- The insertion index resets to the end of the redirected day's list (pinning to the originally-dropped day can still honor the drop's insertion position)

---

## Rule 2 — Overtime Prompt

> Tasks that would exceed 8h/day trigger a modal asking the HOD to choose.

Triggered when `allowOvertime=true` assignment uses hours beyond 8h/day on any part.

**Option A — Assign Full (Overtime)**
- Fills the day up to `MAX_DAILY_HOURS (12h)` with overtime
- Remaining hours spill to the next weekday

**Option B — Assign Available Only (Xh)**
- Only places hours within the normal 8h capacity
- Remaining hours become an overflow fragment (status = `unassigned`)
- Button is **disabled** (red warning shown) if `hoursWithinNormalCapacity === 0` (all 5 weekdays are already at 8h+)

---

## Rule 3 — Overflow to Next Week

> When "Assign Available Only" leaves an overflow fragment, the **server** places it — no client-side carry-forward.

- `buildPreparedDropAssignment` returns an `overflow: {designerId, taskId, hours}` descriptor instead of creating a local unassigned fragment
- `persistWeekSnapshot` batches pending overflow descriptors (`pendingOverflowRef`) and sends them as `overflow[]` on the next `PUT /scheduler-assignments/week/:weekStart` save
- Backend `placeOverflowCapacity` (`scheduler-assignments.service.ts`) walks forward day-by-day from the day after the saved week, skipping weekends/holidays/full-day approved leave, and live-checks each candidate day's actual remaining capacity **inside the same save transaction** — it never trusts an assumption about a week the client hasn't loaded
- Splits across multiple days/weeks if one day isn't enough, bounded by a 56-day lookahead (`maxLookaheadDays`)
- The save response includes `overflowPlacements` (where hours landed) and `unplacedOverflow` (hours that didn't fit within the lookahead — reported to the user via toast, never silently dropped)
- This replaced the old `localStorage` key `scheduler_overflow_v1_YYYY-MM-DD` mechanism entirely (`SCHEDULER_OVERFLOW_KEY`, `addDaysToDateStr`, `pruneOldOverflowKeys`, and the Monday-restore-on-load effect were all removed)
- ⚠️ Known gap: `placeOverflowCapacity` does not check whether the destination week is `isLocked` before writing to it (the primary week-save path does check this for the week being saved) — see `backend/docs/SCHEDULER_FIXES_NEEDED.md` item 11

---

## Rule 4 — Auto-Optimizer

> After any user change (not on ERP snapshot load), the scheduler automatically backfills gaps by pulling tasks forward from later days.

Runs as a React effect whenever `schedules` reference changes and `loadedFromErp === false`.

**Sub-rule 4a — Whole task fits**
- If a task from day N fits entirely in the gap on day M (M < N) → move it whole

**Sub-rule 4b — Optimizer splits to fill gaps**
- If a task is too large to move whole but the gap is ≥ `MIN_SPLIT_HOURS (5min)` → the optimizer splits it: the gap-filling portion moves to the earlier day, the remainder stays on the source day with reduced hours
- Gaps smaller than `MIN_SPLIT_HOURS` are skipped (task left in place)
- The optimizer does NOT split on ERP reload (`loadedFromErp=true` blocks it entirely)

**Sub-rule 4c — Optimizer range**
- targetDay loops Mon→Thu (0→3); sourceDay loops targetDay+1→Fri
- Friday is only ever a source, never a target
- Only fills up to `DAILY_CAPACITY (8h)` — never creates overtime

**Sub-rule 4d — Schedules-reference guard**
- The optimizer effect tracks the last `schedules` object reference via `lastOptimizerSchedulesRef`
- If only `tasks` changed (e.g. `flushPersist` patching `splitIndex`/`totalParts`) but `schedules` is the same reference → optimizer is skipped entirely
- This prevents 4+ redundant `cloneState` calls per user action when many splits are present

**Sub-rule 4e — Persist after optimizer**
- When the optimizer makes any change, it calls `persistWeekSnapshot` so the backend stays in sync

---

## Rule 5 — Split Task Mechanics

> A task split across multiple days (or multiple parts) shares a canonical `parentId`. Split indices are globally sequential across all weeks.

- All parts share the same `parentId` (the original task UUID)
- Each part has a unique scheduler ID: the first part reuses the original UUID; additional parts get `split-N` temp IDs
- `splitIndex` and `totalParts` are **globally sequential across all weeks** — if week 1 has parts 1 and 2, week 2's part is 3 (totalParts=3 on all rows)
- The backend recomputes global indices on every `PUT /scheduler-assignments/week/:weekStart`. Parts in other weeks are updated in the same transaction
- `buildWeekSnapshotPayload` normalises within-week ordering before sending to backend; the backend then applies the global offset
- When any part is dragged to unassigned or ON_HOLD: **all sibling parts across all weeks** are removed from the scheduler. Current-week parts are consolidated in memory; other-week DB rows are deleted via `DELETE /scheduler-assignments/task/:taskId`
- **Stale-consolidation guard:** the frontend computes `expectedAssignmentIds` from the task's known `assignmentRowId` plus its in-memory siblings, and sends it as a query param on that DELETE (or as `expectedAssignmentIds` on `PATCH /tasks/:id/status` for ON_HOLD). The server check-then-deletes and throws `ConflictException` if a live row exists outside that set, instead of silently wiping a sibling the caller didn't know about (e.g. a part scheduled into a week the caller never loaded). Omitting the param preserves the old unconditional-wipe behavior — `TaskDetailsPage.jsx`'s own Hold button still omits it intentionally (see `backend/docs/SCHEDULER_FIXES_NEEDED.md` for a possible false-positive gotcha with this guard)

---

## Rule 6 — Payload Hours

> What gets sent to the backend must match what is actually scheduled.

- Each split part sends its own `assignedHours = scheduledHours` (the actual part hours, not the original full task hours)
- `scheduledHours` is explicitly set to `part.hours` on every new split part created by `buildPreparedDropAssignment` or the optimizer
- Backend rejects any designer+day combination where total `assignedHours > 12h`

---

## Rule 7 — ERP Reload Preserves Exactly What Was Saved

> When loading an existing week from the backend, the schedule is displayed exactly as saved — the optimizer does NOT run.

- `reloadWeek` sets `loadedFromErp=true` when rows are returned from the API → the optimizer effect returns immediately
- This prevents tasks from being rearranged or split on every page load
- `loadedFromErp` is set back to `false` by `applyPreparedAssignment` and `commitPanelDrop` (any user drag action) so the optimizer resumes after the first user interaction
- If no rows exist for the week (fresh week), `loadedFromErp=false` → optimizer runs normally on the mock state

---

## Rule 8 — Locked Weeks

> A locked week cannot be modified.

- Backend rejects PUT on a locked week
- Frontend shows lock indicator; drag-drop is blocked

---

## Rule 9 — Weekend Block

> Days 5 (Sat) and 6 (Sun) cannot receive drops.

- `handleDropToDay` returns early if `targetDayIndex >= 5`

---

## Rule 10 — Project Team Eligibility

> A task can only be dropped onto a NEW designer who is part of its project's team. Existing assignments are never retroactively disturbed by a team change.

- Eligible set = `technicalHead` + `teamLead` + `subTeamLead` + `designers[]`, as configured on the project's Team tab
- Source of truth is the **Project's** team fields, not `Task`'s own separate (unsynced) copy of the same fields
- Matching is by `User.fullName`, trimmed and lowercased — these fields are stored as comma-joined names, not user IDs
- A project with **no team configured at all** (all 4 fields blank — true for every Retail-category project, since the Team tab is Project-only) is unrestricted: any designer may receive its tasks
- **Grandfathering:** the check only applies to a *new* `(taskId, designerId)` pairing — a fresh drop from the sidebar/ON-HOLD panel, or moving a task onto a *different* designer. Moving a task within its current designer's own days (`sourceId === targetDesignerId`) is never checked. If a team changes mid-project, designers already holding that project's tasks keep them undisturbed — the rule only gates where the task can go *next*, it never unassigns or blocks existing work.
- Enforced in both places:
  - Frontend: `handleDropToDay` short-circuits with a toast, skipping the check when `sourceId === targetDesignerId` (`isDesignerEligibleForProject` in `frontend/src/features/scheduler/utils/projectTeamEligibility.js`)
  - Backend: `PUT /scheduler-assignments/week/:weekStart` rejects the whole request with `400` if any *new* row violates this — rows matching an already-saved `(taskId, designerId)` pair for that week are skipped (`assertDesignerEligibleForProjectTeam` in `scheduler-assignments.service.ts`)
- The auto-optimizer (Rule 4) never needs this check — it only moves a task within the same designer's days, never across designers
- The scheduler grid also has a "filter by project/op no" input that dims (but does not hide) designer rows ineligible for the resolved project, as a pre-drag visual aid — independent of the hard block above

---

## Rule 11 — Partial-Work Handoff (Reassigning a Busy Designer's Task)

> When a task already has logged timer hours and is dragged to a **different** designer, only the unworked remainder should move — not the original full block.

- Backend (`GET /scheduler-assignments`) joins the designer's in-progress `TaskWorkSession` (`status: 'Draft'`) for each `(designerId, taskId)` pair and returns it as `workedHours` on every assignment row for that pair
- Frontend (`handleDropToDay`) checks `workedHours` only when `sourceId !== targetDesignerId` (a real reassignment, not reordering the same designer's own days) — same-designer moves are never reduced
- `remainingHours = max(0, scheduledHoursForThisBlock - workedHours)` is computed once per `(sourceDesignerId, canonicalTaskId)` pair per session (tracked via `consumedWorkedHoursRef`), so a task split across multiple days for the same designer doesn't have its logged hours subtracted more than once
- If `remainingHours` is 0 (all scheduled hours already logged), the drop is rejected with a toast — there is nothing left to hand off
- **The original designer's card does not disappear.** It is shrunk in place to exactly the hours they logged and locked (`isLocked: true`, `isLoggedRemainder: true`) — non-draggable, but still clickable through to the task view, labeled "· logged" in the UI. A brand-new split part (fresh `split-N` id, `parentId` = the canonical task) carries the unworked remainder to the new designer through the normal day-packing logic
- Both the shrunk original row and the new remainder row reference the **same real task ID** and are persisted as ordinary `SchedulerAssignment` rows on save — this is just Rule 5's split mechanics with the first part locked and routed to a different designer, not a separate system
- The original designer's `TaskWorkSession` record is separately left untouched; it remains the payroll/audit record of the work they actually did
- This only accounts for time logged via the in-app timer (`save-timer`/`submit-work`), not manual status changes
- **No pause is required before a reassignment.** `workedHours` reflects whatever was saved as of the designer's last Play/Pause/Stop click — the HOD's drag can't reach into the designer's own browser tab to force a pause, so if the timer is still actively running when the drag happens, the number can undercount by however long they've been going since that last sync. The handoff toast is a `toast.warning` with a description flagging this, but the drag is never blocked on it
- All logged/remaining time is rounded UP to the next **5-minute** step — the timer (`ProjectTaskTimer.jsx`) rounds `accumulatedSeconds` up on every Play/Pause/Stop transition (any nonzero effort is credited at least 5 minutes, e.g. 3m20s → 5m, never 0m), and the toast/UI show it as `Xh Ym`, never raw seconds or decimal hours
- Hours are rounded to 2 decimal places wherever they cross the wire (`workedHours` from the backend, `remainingHours`/`loggedHours` on the frontend) since 5-minute buckets don't divide evenly in decimal hours (20min = 0.3333...h) and the save DTO caps at 2 decimal places — 2-decimal precision is well within half a 5-minute bucket, so it always reconstructs to the correct minute count

---

## Rule 12 — Pinned Placement Override (Redirect Dialog)

> An HOD can deliberately place a task on a later day even while an earlier day still has room, by pinning it.

- Whenever Rule 1 would redirect a drop (an earlier day has `usedHours < 8h`), the drop opens a blocking dialog instead of auto-placing silently
- The dialog offers two placements plus Cancel, and shows the designer, task name/project, and a day-comparison card for context:
  - **"Place on {gap day} (first open day)"** — the normal Rule 1 outcome; not pinned; movable by Rule 4's optimizer like any other task. **Autofocused by default.**
  - **"Schedule on {dropped day} (as dropped)"** — places the task exactly where it was dropped and sets `isPinned: true`
- Pinning is a **per-placement decision, not a sticky tag** — dropping a *different* task later, even onto the same day as an existing pin, re-evaluates Rule 1 independently and can still redirect. Manually re-dragging an already-pinned task also re-evaluates fresh: if that specific drop doesn't go through the "Schedule on X (as dropped)" choice again, the pin is cleared, not carried forward
- **Rule 4's auto-optimizer never moves or splits a pinned task** — it is always kept in place (`keptInSource`) when the optimizer scans a day for candidates to pull backward into a gap. This is required, not optional: without it, the very next optimizer pass would drag the pinned task straight back into the gap it was pinned past
- If the chosen placement (gap day or pinned day) would also exceed 8h/day, Rule 2's overtime modal still opens afterward, sequenced after the redirect decision — a pin does not bypass the overtime flow, and `isPinned: true` survives whichever overtime option (Assign Full / Assign Available Only) is ultimately chosen
- `isPinned` is persisted on `SchedulerAssignment` and round-trips through ERP reload, leave rescheduling/revocation snapshots, and save
- Pinned cards show a small 📌 marker in the grid so it's visible why a gap isn't being auto-filled

---

## What Is NOT Currently Handled

| Case | Status |
|---|---|
| Pulling tasks across designers | Supported for hours (Rule 11); optimizer itself still only packs within each designer |
| Splitting a task manually by hours | Not supported — only drag-based and optimizer splitting |
| Fractional hours (< 1h granularity) | No practical floor at the optimizer level (`MIN_SPLIT_HOURS = 5min/0.0833h`, see Constants); the backend DTO's `assignedHours`/`hours` fields separately enforce `@Min(0.01)` (2-decimal precision) — a lower-level "must be positive" guard, not the same threshold as `MIN_SPLIT_HOURS` |
| Re-assigning overflow if next week is also full | Overflow lands on the last available day or Monday as fallback |
| Partial work submission | `POST /tasks/:id/submit-work` always marks the task fully `DESIGN_COMPLETED` — there's no "submit partial, keep in progress" flow yet |
