# Reallocation — Issues, Gaps & Efficiency

Audit date: 2026-07-28  
Scope: designer → HOD reallocation request flow (API, handoff packing, Requests UI, Design List queue).

Related: `SCHEDULER_RULES.md` Rule 13, `backend/src/reallocation-requests/`, `applyReallocationHandoff` in scheduler-assignments.

---

## Already in good shape

- CTA gated on **unlocked remaining hours** — after approve, old designer with only “· logged” cards no longer sees Request reallocation
- Requests page has a **Reallocation** tab next to Overtime / Regularization; leave stays in Leave Planner with a cross-link
- Team eligibility enforced on create / approve / eligible-designers
- Locked **source** weeks block approve
- Unit tests cover main create/review guards (`reallocation-requests.service.spec.ts`)

---

## Worth fixing soon

| # | Issue | Why it matters | Suggested fix |
|---|--------|----------------|---------------|
| 1 | **Approve is not atomic with timer freeze** | `freezeDraftWorkSession` runs *before* the handoff transaction. If packing fails (locked week, no free capacity), the draft/timer can already be frozen while the request stays `Pending`. | Freeze inside the same transaction as handoff, or freeze only after a successful pack (or roll back / restore draft on failure). |
| 2 | **Partial pack still “succeeds”** | If some hours don’t fit in the 4-week lookahead, approve returns `unplacedHours > 0` but the UI only toasts “approved”. Hours can go missing without a clear warning. | Surface `unplacedHours` in toast / review UI; optionally reject approve when `unplacedHours > 0`, or extend lookahead / ask HOD to confirm. |
| 3 | **Double-submit race** | Pending check is app-level only. No unique index on `(taskId, requesterId)` for `Pending`. Two quick submits can create two pendings. | Filtered unique index (or upsert pattern) for one pending per requester+task; keep app-level guard. |
| 4 | **Stale pending after work finishes** | If the requester logs everything (or the task completes) while `Pending`, the request isn’t auto-cancelled. HOD can still open Approve and hit “nothing left to reallocate”. | On review (and optionally on timer/submit), invalidate when remaining unlocked hours &lt; 0.01; or cron/soft-cancel. |

---

## Product / UX gaps

| # | Gap | Notes |
|---|-----|--------|
| 5 | **Old designer can still “own” the task** after approve if locked logged cards remain | CTA is hidden (correct). Task may still appear on their list / `TaskDesigner` junction — intentional for Rule 11-style logged remainder, but confusing. Document clearly or hide from “active work” lists when unlocked hours = 0. |
| 6 | **Two review UIs** | Design List (`?view=reallocation`) and Requests → Reallocation. Both work; Rule 13 docs still mainly mention Design List. Update `SCHEDULER_RULES.md`. |
| 7 | **Create form task options** | Doesn’t exclude tasks that already have a pending request; after submit, options aren’t refreshed. |
| 8 | **Approve response underused on frontend** | `unplacedHours` / `affectedWeekStarts` / `remainingHoursMoved` returned by API but not shown in toast or modal. |
| 9 | **HOD create path** | Managers can create if they “own” the task (role gate allows HOD). Unusual; confirm product intent. |
| 10 | **Activity `messageKey`s** | Events logged (`reallocation_request_*`); confirm activity feed copy maps them. |

---

## Efficiency (not urgent)

| # | Issue | Impact | Suggested improvement |
|---|--------|--------|------------------------|
| 11 | **`mapWithRemaining` N+1** | One hours query per pending row on inbox / list endpoints | Single grouped `SUM(assignedHours)` by `(taskId, designerId)` for pending rows |
| 12 | **`listEligibleDesigners`** | Loads all Designer/HOD users, then filters by project team names in memory | Resolve team members first (shared team util), then query users by id/name set |
| 13 | **Handoff split-index rewrite** | One `update` per assignment part inside the long (60s) transaction | Batch update or fewer round-trips |
| 14 | **Task detail extras** | `GET /tasks/:id` always loads pending reallocation + viewer remaining hours | Acceptable for one task; keep unless profiling shows cost |

---

## Recommended fix order

1. Atomic freeze + handoff (or restore on failure)  
2. Unplaced-hours policy + UI warning  
3. Unique pending constraint + keep service guard  
4. Invalidate stale pendings on review (and optionally on work completion)  
5. Batch remaining-hours for list endpoints  
6. Doc/UX polish (Rule 13, task-options filter, approve toast)

---

## Out of scope / not bugs

- Leave stays on Leave Planner (not merged into Requests tabs) — by design  
- Destination locked weeks are skipped during pack (source locked weeks block) — by design  
- Task status unchanged while reallocation is pending — by design (Rule 13)
