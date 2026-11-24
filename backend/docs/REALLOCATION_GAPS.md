# Reallocation — Issues, Gaps & Efficiency

Audit date: 2026-07-28  
Updated: 2026-08-07 — fixed #1 (atomic freeze), #2 (6-week pack + warn toast), and #3 (pending unique index); #11 `mapWithRemaining` batch; #12 `listEligibleDesigners` team-first. 2026-09-16 — #13 handoff row updates batched. 2026-11-24 — doc sync (#6).  
Scope: designer → HOD reallocation request flow (API, handoff packing, Requests UI, Design List queue).

Related: `SCHEDULER_RULES.md` Rule 13, `backend/src/reallocation-requests/`, `applyReallocationHandoff` in scheduler-assignments.

---

## Already in good shape

- CTA gated on **unlocked remaining hours** — after approve, old designer with only “· logged” cards no longer sees Request reallocation
- Requests page has a **Reallocation** tab next to Overtime / Regularization; leave stays in Leave Planner with a cross-link
- Team eligibility enforced on create / approve / eligible-designers
- Locked **source** weeks block approve
- Unit tests cover main create/review guards (`reallocation-requests.service.spec.ts`)
- **Eligible designers** resolved team-first via `collectProjectTeamNames` (empty-team directory fallback unchanged)
- **Approve freezes the draft timer inside the same DB transaction as handoff packing** — a failed pack rolls back the freeze; request stays `Pending` with the timer still Draft
- **At most one `Pending` row per `(taskId, requesterId)`** — app `findFirst` guard plus filtered unique index `UQ_ErpTSReallocationRequest_pending_task_requester` (`prisma/sql/add-reallocation-pending-unique.sql`); create maps `P2002` to the same BadRequest
- **Pack lookahead is 6 weeks**; if `unplacedHours > 0`, approve still succeeds and both HOD UIs toast a **warning** (moved vs unplaced), never a silent success

---

## Worth fixing soon

| # | Issue | Why it matters | Suggested fix |
|---|--------|----------------|---------------|
| ~~1~~ | ~~**Approve is not atomic with timer freeze**~~ | ~~`freezeDraftWorkSession` ran *before* the handoff transaction.~~ | **Fixed:** freeze lives inside `applyReallocationHandoff`'s `$transaction`. |
| ~~2~~ | ~~**Partial pack still “succeeds” silently**~~ | ~~UI only toasts “approved” when `unplacedHours > 0`.~~ | **Fixed:** 6-week lookahead + warn-only toast via `reallocationApproveFeedback`. |
| ~~3~~ | ~~**Double-submit race**~~ | ~~Pending check was app-level only.~~ | **Fixed:** filtered unique index + `P2002` → BadRequest; keep `findFirst` guard. |
| 4 | **Stale pending after work finishes** | If the requester logs everything (or the task completes) while `Pending`, the request isn’t auto-cancelled. HOD can still open Approve and hit “nothing left to reallocate”. | On review (and optionally on timer/submit), invalidate when remaining unlocked hours &lt; 0.01; or cron/soft-cancel. |

---

## Product / UX gaps

| # | Gap | Notes |
|---|-----|--------|
| 5 | **Old designer can still “own” the task** after approve if locked logged cards remain | CTA is hidden (correct). Task may still appear on their list / `TaskDesigner` junction — intentional for Rule 11-style logged remainder, but confusing. Document clearly or hide from “active work” lists when unlocked hours = 0. |
| 6 | **Two review UIs** | Design List (`?view=reallocation`) and Requests → Reallocation. Both work; both are now listed in `SCHEDULER_RULES.md` Rule 13. |
| 7 | **Create form task options** | Doesn’t exclude tasks that already have a pending request; after submit, options aren’t refreshed. |
| 8 | **Approve response partly used** | `unplacedHours` / moved hours now shown in toast; `affectedWeekStarts` still unused in UI. |
| 9 | **HOD create path** | Managers can create if they “own” the task (role gate allows HOD). Unusual; confirm product intent. |
| 10 | **Activity `messageKey`s** | Events logged (`REALLOCATION_REQUEST_SUBMITTED/APPROVED/REJECTED/CANCELLED`); they are excluded from project/task history timelines (`PROJECT_HISTORY_EXCLUDED_ACTIONS`). Confirm the team feed copy maps them. |

---

## Efficiency (not urgent)

| # | Issue | Impact | Suggested improvement |
|---|--------|--------|------------------------|
| 11 | **`mapWithRemaining` N+1** | ~~One hours query per pending row~~ **Fixed 2026-08-07:** single `groupBy` `_sum` by `(taskId, designerId)` |
| ~~12~~ | ~~**`listEligibleDesigners`**~~ | ~~Loads all Designer/HOD users, then filters by project team names in memory~~ | **Fixed 2026-08-07:** `collectProjectTeamNames` + team-name `findMany` (empty-team fallback unchanged) |
| ~~13~~ | ~~**Handoff split-index rewrite**~~ | ~~One `update` per assignment part inside the long transaction~~ | **Fixed 2026-09-16:** `batchUpdateLoggedRemainder()` / `batchUpdateSplitIndices()` — one `CASE`-keyed `UPDATE` each (see `TESTING_PROGRESS.md` session 2). The ~15–20 fixed round-trips per handoff remain; slow routes get a 90s timeout (`HTTP_SLOW_ROUTE_TIMEOUT_MS`) |
| 14 | **Task detail extras** | `GET /tasks/:id` always loads pending reallocation + viewer remaining hours | Acceptable for one task; keep unless profiling shows cost |

---

## Recommended fix order

1. ~~Atomic freeze + handoff (or restore on failure)~~ **done**  
2. ~~Unplaced-hours policy + UI warning~~ **done** (6-week lookahead + warn-only toast)  
3. ~~Unique pending constraint + keep service guard~~ **done**  
4. Invalidate stale pendings on review (and optionally on work completion)  
5. ~~Batch remaining-hours for list endpoints~~ **done** (#11)  
6. ~~Team-first `listEligibleDesigners`~~ **done** (#12)  
7. UX polish (task-options filter) — Rule 13 doc update done

---

## Out of scope / not bugs

- Leave stays on Leave Planner (not merged into Requests tabs) — by design  
- Destination locked weeks are skipped during pack (source locked weeks block) — by design  
- Task status unchanged while reallocation is pending — by design (Rule 13)
