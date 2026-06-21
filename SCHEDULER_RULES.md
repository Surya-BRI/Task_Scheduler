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

---

## Rule 1 — Sequential Fill (No Gaps)

> A designer's days must be filled in order. You cannot assign hours to a later day while an earlier day still has room.

- When a task is dropped onto day N, check if any day < N has `usedHours < 8h`
- If yes → redirect the drop to that earlier day, toast "Placed on Mon — fill earlier days first"
- Applies to **all drag sources**: sidebar, ON-HOLD panel, another designer's cell
- The insertion index resets to the end of the redirected day's list

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

> When "Assign Available Only" leaves an overflow fragment, it carries to next week.

- `persistWeekSnapshot` writes overflow fragments to `localStorage` key `scheduler_overflow_v1_YYYY-MM-DD` (next Monday's date)
- When next week loads, overflow tasks are placed starting at the **first weekday with < 8h capacity** (sequential, not blindly Monday)
- After placement, the backend is persisted immediately
- Overflow localStorage is cleared after reading

---

## Rule 4 — Auto-Optimizer

> After any user change (not on ERP snapshot load), the scheduler automatically backfills gaps by pulling tasks forward from later days.

Runs as a React effect whenever `schedules` reference changes and `loadedFromErp === false`.

**Sub-rule 4a — Whole task fits**
- If a task from day N fits entirely in the gap on day M (M < N) → move it whole

**Sub-rule 4b — Optimizer splits to fill gaps**
- If a task is too large to move whole but the gap is ≥ `MIN_SPLIT_HOURS (1h)` → the optimizer splits it: the gap-filling portion moves to the earlier day, the remainder stays on the source day with reduced hours
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
- When any part is dragged to unassigned or ON_HOLD: **all sibling parts across all weeks** are removed from the scheduler. Current-week parts are consolidated in memory; other-week DB rows are deleted via `DELETE /scheduler-assignments/task/:taskId`. All overflow localStorage entries for this task are also cleared

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

## What Is NOT Currently Handled

| Case | Status |
|---|---|
| Pulling tasks across designers | Not supported — optimizer only packs within each designer |
| Splitting a task manually by hours | Not supported — only drag-based and optimizer splitting |
| Fractional hours (< 1h granularity) | Minimum split size is 1h — gaps smaller than 1h are skipped |
| Re-assigning overflow if next week is also full | Overflow lands on the last available day or Monday as fallback |
