# Scheduler time model (production)

Three layers keep planning, execution, and payroll auditable without mixing them.

## Concepts

| Term | Source | Meaning |
|------|--------|---------|
| **Assigned time** | `SchedulerAssignment.assignedHours` | HOD-planned hours on a **slice** (designer + day + optional split part) |
| **Logged time** | `TaskWorkSession` (Draft / HandedOff / Submitted) | Designer timer — actual work, 5-minute buckets |
| **Approved overtime** | `OvertimeRequest` + scheduler OT row | HR/manager-approved hours **beyond** normal day capacity |

## Slice (assignment row)

One schedulable block on the grid:

- Alex · Mon · 2h (part 1/2)
- Alex · Tue · 1h (part 2/2)
- Allen · Wed · 1h (after handoff)

Each slice has its own **assigned** hours. The timer still runs at **task** level (one UUID), but handoff math uses **FIFO allocation**: logged time fills earliest slices first (Mon, then Tue).

## Handoff (cross-designer drag)

When HOD moves a slice from designer A → B:

1. **Peek** A's draft session (no DB change).
2. **FIFO-allocate** logged hours across A's slices for that task.
3. **Only the dragged slice's allocation** is used — not whole-task total.
4. If allocation on this slice is **0** → full slice moves to B. A's draft session is frozen (`freezeDraftWorkSession(closeSession=false)` clears `runStartedAt`) rather than left running; if A still has other active slices, A gets a "Timer Paused" notification and must press Start again to resume tracking.
5. If allocation **> 0** → A keeps a locked "· logged" card; B gets remainder.
6. **HandedOff** (timer closed) only when A has **no other active slices** on that task; otherwise the session stays `Draft` but paused (step 4).

Example: Mon 2h + Tue 1h, Alex logged 1h 20m on Mon, drag **Tue 1h** to Allen → Tue allocation = **0** → Allen gets **full 1h**, Alex keeps Mon; if Alex's timer was running, it's now paused and Alex is notified to press Start again.

## Overtime

| Trigger | Flow |
|---------|------|
| Scheduler grid | Day total > 8h normal → OT strip / formal OT request |
| Task timer | `logged > assigned` for designer's slices → UI prompts OT request |
| Approved OT | Appears as separate locked OT block on scheduler |

Timer OT is **informational + request path** — it does not auto-approve payroll OT.

## Task detail display

- **Assigned** — sum of scheduler slices for viewer (or per-designer breakdown for HOD)
- **Logged** — draft + handed-off + submitted seconds for viewer
- **Remaining** — assigned − logged (floor 0)
- **Over assigned** — logged > assigned → link to create overtime request

## Session statuses

| Status | Meaning |
|--------|---------|
| `Draft` | Active or paused timer |
| `HandedOff` | Finalized when designer's last slice was reassigned; no more timing |
| `Submitted` | Designer completed/submitted work |

## API

| Endpoint | Purpose |
|----------|---------|
| `GET /tasks/:id/draft-work-peek?designerId=` | Read logged seconds without mutating |
| `POST /tasks/:id/freeze-draft-session` | Finalize on handoff. `closeSession=true` (default) marks `HandedOff`; `closeSession=false` pauses a running timer without closing the session, and sends a "Timer Paused" notification if the timer was actually running |
| `GET /tasks/:id` → `schedulerHours` | Assigned slices + logged per designer |
