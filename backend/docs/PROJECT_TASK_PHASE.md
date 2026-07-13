# Project Task Phase Grouping

**Status:** Implemented (2026-07-11).

---

## What This Solves

PROJECT-type tasks are created in batches via the **Create Task modal** (`ProjectCreateTaskModal.jsx`) — one submission ticks several discipline checkboxes across several sign-type rows, and each tick becomes one `ErpTSTask`. A project's task history often comes in waves (an initial release, then follow-up batches weeks/months later for missed items or new revisions), but there was no way to see *when in that rollout* a given task was created beyond raw `createdAt` ordering.

**Phase** is a small integer (1, 2, 3...) tagged onto every task created in one submission, so the HOD can see and filter the project's release history at a glance.

---

## Scope Decisions

- **Project-wide, not per-opNo.** One phase counter is shared across every opNo/product line and sign type within a project — not a separate counter per product.
- **Retail tasks never get a phase.** Only the Project design-type path (`ProjectCreateTaskModal.jsx` → `POST /tasks/extended` with `designType: 'Project'`) writes `phase`; the Retail path (`CreateTaskModal.jsx`) is untouched and `phase` stays `NULL` for those rows.
- **Existing tasks were backfilled to `phase = 1`** in the same migration that added the column, so "every project task has a phase" holds immediately — there is no "no phase" state to handle in the UI going forward.

---

## How the Suggested Phase Is Computed ("smart" suggestion)

Phase behaves like `revisionCode` already does: **one value per Create-Task submission**, applied uniformly to every task created in that batch (not resolved per line).

The frontend fetches `GET /tasks/next-phase?opNo=&projectNo=&designType=Project` when the modal opens, which returns:
```json
{ "projectId": "...", "maxPhase": 2, "bySignType": { "Pylon": { "maxPhase": 2 }, "Monolith": { "maxPhase": 1 } } }
```

As the HOD ticks discipline checkboxes, the modal recomputes a **live suggestion** using the same tie-break rule the backend uses as its own fallback:

1. Look at the distinct sign types among currently-checked rows.
2. If any of them already has phase history in this project (`bySignType`), suggest `max(their last phases) + 1` — i.e. continue the most-recently-touched sign type's lineage. This can suggest an already-existing phase number, not necessarily the newest one, if that's where the sign type's lineage naturally continues.
3. If none of the checked sign types have prior history, suggest `maxPhase + 1` (a brand-new phase for the project).

A short hint under the dropdown explains which rule fired (e.g. *"Sign type B315 was last used in Phase 1."*). The HOD can always override via the dropdown — selecting a value stops the live recompute for the rest of that modal session (mirrors how `revisionCode` becomes freely editable once prefetched).

**Fetch-failure fallback:** if `GET /tasks/next-phase` fails, the dropdown (which would otherwise only be able to offer "Phase 1 (New)") is replaced by a plain editable number input, so the HOD can still type a known phase instead of being silently limited to 1.

---

## Backend

- `phase` is resolved **once per submission**, before the per-line loop in `createExtended`'s Project path — unlike `revisionCode`, which can differ per line when auto-resolved (phase is project-scoped, not per-(opNo, signType)).
- If the client omits `phase` entirely, the backend falls back to the same tie-break logic itself (`TasksService.resolveNextPhase`), scoped by the sign types present in that submission — so `phase` is effectively never null for a new Project task, even from a hypothetical future caller that doesn't send it.
- `phase` carries no DB uniqueness constraint (unlike `revisionCode` + its `UX_ErpTSTask_Project_RevisionDisciplineHash` index). Two HODs creating batches in the same project concurrently could both resolve the same "next phase" number — treated as an acceptable cosmetic-only race, consistent with the existing tolerance for the `revisionCode` race.

### Key methods (`backend/src/tasks/tasks.service.ts`)

| Method | Purpose |
|---|---|
| `getPhaseContext(tx, projectId)` | Project-wide max phase + each sign type's own last-used phase |
| `resolveNextPhase(context, signTypes)` | The tie-break rule described above |
| `getNextPhase(query)` | Backs `GET /tasks/next-phase`; resolves `projectId` from `projectNo`/`opNo` if not given |

### Endpoint

`GET /tasks/next-phase` — same query shape and role list (`HOD, DESIGNER, SALESPERSON`) as the existing `GET /tasks/next-revision`.

---

## Visibility

- `ProjectTaskList` (`frontend/src/views/TaskDetailsPage.jsx`) shows a **Phase** column (`PhasePill`), non-Retail tasks only.
- A **phase filter dropdown** above the list ("All Phases" / "Phase 1" / "Phase 2" / ...) lets the HOD narrow the list to one release wave. Built from the distinct phases present in the already-fetched task list — no extra API call. Task list sort order (`createdAt desc`) is unchanged.

---

## Affected Files

| File | Change |
|------|--------|
| `backend/prisma/sql/add-phase-to-task.sql` | Idempotent migration: adds `phase INT NULL`, a supporting index, and backfills existing Project tasks to `phase = 1` |
| `backend/prisma/schema.prisma` | Added `phase Int?` to `Task` |
| `backend/src/tasks/dto/create-extended-task.dto.ts` | Added optional `phase?: number` to `ExtendedTaskCoreDto` |
| `backend/src/tasks/tasks.service.ts` | `getPhaseContext`, `resolveNextPhase`, `getNextPhase`; `createExtended` resolves and writes `phase` once per submission; added `phase: true` to `TASK_SELECT`/`TASK_LIST_SELECT` |
| `backend/src/tasks/tasks.controller.ts` | `GET /tasks/next-phase` route |
| `backend/src/tasks/scheduler-task-summary.util.ts` | Added `phase` to the shared scheduler summary select/DTO/mapper |
| `backend/src/tasks/tasks.service.spec.ts` | Coverage for `resolveNextPhase`'s tie-break cases, `getNextPhase`, and `createExtended` writing the same `phase` onto every task in a submission |
| `frontend/src/components/ProjectCreateTaskModal.jsx` | Phase-context fetch, live suggestion + hint, Phase dropdown (with manual-entry fallback on fetch failure), `phase` added to the `/tasks/extended` payload |
| `frontend/src/views/TaskDetailsPage.jsx` | `PhasePill`, Phase column in `ProjectTaskList`, phase filter dropdown |

---

## Known Gaps / Follow-ups

- No uniqueness/locking on `phase` — see concurrency note above.
- The "smart" tie-break only looks at sign types being created *in this submission*; it doesn't warn the HOD if they manually pick a phase that conflicts with a sign type's own established lineage (e.g. picking Phase 1 for a sign type whose latest task is already in Phase 3). This is intentional — the dropdown is advisory, not enforced — but worth knowing if that turns out to cause confusion in practice.
