# UAT / Smoke Test Progress — Post ERP-Auth Migration

_Last updated: 2026-09-17 (session 3)_

Context: the app was migrated to authenticate directly against ERP's own
`ErpAuthUsers`/`ErpAuthUserRoleMap`/`ErpMasterRole` tables (bigint `userId`
identity), replacing the old local GUID-based `ErpTSUser` identity. Every
business table that referenced a user was re-keyed to the new bigint id.
This doc tracks what's been smoke-tested since that migration, what bugs
were found/fixed, and what's still untested.

## Test accounts (all password `Tester@321` — updated 2026-09-17, was `tester@321`)

| Username | Role |
|---|---|
| Sithara-UAT, Fahad-UAT | SALESPERSON |
| Gopan-UAT, Tony-UAT, Priya-UAT, Rahul-UAT | HOD |
| Amal-UAT, Alekhya-UAT, Kiran-UAT, Meera-UAT, Devan-UAT | DESIGNER |
| Aleena-UAT, Chithira-UAT | QS |

## Tested and confirmed working (live API calls, not just unit tests)

| Flow | Role(s) tested as | Notes |
|---|---|---|
| Login | HOD, Designer, Sales | Direct ERP auth, JWT issued correctly |
| `GET /auth/me` | HOD, Designer | |
| Project list / read | HOD | |
| Project update (set team: technicalHead/teamLead/subTeamLead/designers) | HOD | |
| Task creation (Retail flow) | HOD | Project flow blocked by legit QS-gate, not reached |
| Task assignment to designer | HOD | Status auto-promotes to DESIGN_PLANNED |
| Task listing (designer's own tasks) | Designer | |
| Chatter: create post + mention | HOD | |
| Chatter: like post | HOD | |
| Chatter: mark post seen | HOD | |
| Leave request: create + duplicate-detection | Designer | |
| Timer: start / pause / freeze (HOD-gated) | Designer, HOD | |
| Scheduler week save (place task on a day) | HOD | Required correct Monday week-start + dayIndex |
| Overtime request: create → submit → HOD review/approve | Designer, HOD | |
| Regularization request: task-options query + create | Designer | Create succeeded but took **54s** — see perf issue below, now root-caused |
| Regularization request: review (approve + reject) | HOD | Both work; reject requires `comments` field (not `remarks` — different DTO shape than reallocation's reject) |
| Reallocation request: task-options, eligible-designers, create, review/approve | Designer, HOD | Functionally correct (handoff really moves scheduler hours + task ownership), but **hits the perf/timeout bug below on both create and review** |
| Scheduler week lock / unlock | HOD | Clean |
| Scheduler day-locks: create + delete | HOD | Clean |
| Overtime: attachment upload | Designer(-role account) | Works, but only the request's own `designerId` may upload — an HOD who submitted on a designer's behalf gets 403, which is correct/intentional, not a bug |
| Overtime: statistics, export | HOD | Both return promptly |
| QS: sign register (`sign-rows` PUT, `qs-submit`, `qs-status`) | QS | Full flow works end-to-end once a project has a QS assignment. Note: `qs-submit` requires the row payload to include the `id`s returned by the prior `sign-rows` save — submitting without them fails with "Please save your changes before submitting" (working as designed, just non-obvious) |
| QS project auto-assignment | HOD (via project create) | New projects auto-assign all QS users; existing pre-migration projects have no QS assignment row, hence the previously-seen gate error |
| Chatter: comment replies | Designer, HOD | Found and fixed a real bug — see below |
| Chat/conversations: create, send message, list, mark read | HOD, Designer | Full DM flow clean |
| Notifications: list, unread-count, mark read/unread, read-all | HOD | Clean |
| Dashboard: metrics, projects-overview | HOD | Clean, correctly reflects reallocation handoff |
| Activity log: task-scoped read | HOD | Found and fixed a real bug — see below |
| Task file upload (`/tasks/upload-file`) | HOD | Clean (uploads to the shared production S3 bucket — confirmed intentional) |
| Task status transitions: IN_PROGRESS → DESIGN_COMPLETED → HOD_REVIEW → SALES_REVIEW → CLIENT_REJECTED → REWORK | Designer, HOD, Sales | All role gates enforced correctly (e.g. only Sales/Admin can mark CLIENT_REJECTED, Sales can only act from SALES_REVIEW). **CLIENT_REJECTED hit the same perf/timeout bug below** |

## Bugs found and fixed during this pass

All are leftover GUID-vs-bigint validation/logic gaps from the ID migration
(pattern: code still assumed user ids were GUIDs or did `.trim()` on what's
now a `bigint`):

1. `AssignTaskDto.assigneeId` — validated as UUID
2. `FreezeDraftWorkSessionDto.designerId` — validated as UUID
3. `CreateSchedulerDayLockDto` / `DeleteSchedulerDayLockDto.designerId` — validated as UUID
4. `SchedulerAssignmentInputDto` / `SchedulerOverflowInputDto.designerId` (scheduler week save) — validated as UUID
5. `CreateConversationDto.participantIds` — validated as UUID
6. `CreateChatterPostDto` / `CreateChatterCommentDto.mentionUserId(s)` — validated as UUID
7. `chatter-mentions.util.ts`'s `uniqueUuids()` used on user ids in 6 places in `chatter-posts.service.ts` — silently dropped every mention (added `uniqueUserIds`/`optionalUserId`, fixed call sites)
8. `entityIdKey()` in `chatter-posts.service.ts` — was aliasing the *user*-id normalizer to key post/comment-id maps, silently breaking seen-by lists and mention lookups everywhere in chatter
9. `chatter-posts.service.ts` — `likePost`/`markPostsSeen` validated `userId` param as UUID (added `optionalUserId` to `sql-param.util.ts`)
10. `CreateOvertimeRequestDto.designerId`, `UpdateOvertimeRequestDto.designerId` — validated as UUID
11. `CreateRegularizationRequestDto.designerId` — validated as UUID
12. `CreateReallocationRequestDto.suggestedDesignerId`, `ReviewReallocationRequestDto.targetDesignerId` — validated as UUID
13. `regularization-requests.controller.ts` / `reallocation-requests.controller.ts` — both had 2 query-param `designerId` checks each still calling the GUID-based `isUuidString` instead of the already-fixed `isPositiveIntegerString` (the service layer had been fixed, the controllers were missed)
14. `scheduler-assignments.service.ts`'s `mapRow()` — `row.assignedBy?.trim()` called directly on what's now a `bigint`, threw `TypeError`, causing scheduler week-save to 500 (the save itself succeeded before this line, so data was persisted despite the error response — a save-then-500 correctness trap)
15. `structured-log.util.ts` — dev-mode log formatter silently dropped the `error` field (stack traces) entirely, which is how bug #14 originally went invisible; fixed to include it

## Bugs found and fixed — session 2 (2026-09-16)

16. `chatter-posts.service.ts`'s `mapCommentRow()` — ran `postId` (a UUID) through `normalizeUserId()`, a helper that only accepts numeric bigint ids and returns `null` for anything else. Every comment's `postId` came back `null` in API responses, which broke `attachComments()`'s group-by-postId logic — **comment replies were silently dropped from the embedded `comments[]` array on `GET /chatter-posts`**, even though the comment itself was saved correctly and visible via the standalone `GET /:postId/comments` endpoint. Fixed by returning the UUID string directly instead of normalizing it.
17. `activities.service.ts`'s `mapRow()` — read `row.user?.id`, but the Prisma select for that relation only projects `{ userId, userName }` (post-migration field name); `id` doesn't exist on the row, so **every activity-log entry's `actor.id` came back as an empty string**. Fixed to read `row.user?.userId`.

## Known but unresolved — session 2 (2026-09-16)

**Systemic perf issue: multi-designer/scheduler-touching writes intermittently exceed the 30s request timeout, and the write still commits (save-then-500 trap).**

Reproduced on three independent endpoints:
- `POST /reallocation-requests` (create) — timed out at 30s, request had persisted
- `POST /reallocation-requests/:id/review` (approve) — timed out at 30s, approval had persisted
- `PATCH /tasks/:id/status` → `CLIENT_REJECTED` — timed out at 30s, status had persisted
- `PATCH /tasks/:id/status` → `REWORK` (as HOD) — succeeded but took 27s, right at the edge

This is very likely the same root cause as the previously-flagged "54s regularization create" outlier — not a coincidence across three unrelated modules.

Two contributing factors identified, in order of confidence:
1. **Confirmed root cause for the reallocation-specific case**: `applyReallocationHandoff()` in `scheduler-assignments.service.ts` (~line 3919) did a sequential loop of individual `await tx.schedulerAssignment.update(...)` calls — one DB round-trip per scheduled day/slice — all inside a single Prisma interactive transaction against a **remote** SQL Server (`13.234.241.125`, not local). No batching.
2. **Contributing, not sufficient alone**: found and killed 3 stale orphaned `npm run dev`/`start:dev` node processes left over from earlier crashed `nest --watch` sessions (matches the doc's own "Known infra flakiness" note below).

### Fixes applied — session 2 continued

- **Batched the per-row scheduler writes.** Added `batchUpdateLoggedRemainder()` and `batchUpdateSplitIndices()` (both in `scheduler-assignments.service.ts`, right before `applyReallocationHandoff`) — each does one `UPDATE ... SET col = CASE id WHEN ... END WHERE id IN (...)` raw statement instead of N separate `.update()` calls. Verified against a fresh 5-day-slice reallocation: the row-update logic itself now completes correctly in far fewer round-trips.
- **This alone did not fully solve the timeout.** Re-timed the same 5-row handoff after batching and it still took the full 30s and hit the save-then-500 trap. Root cause turned out to be broader than the row-loops: `applyReallocationHandoff` makes a large *fixed* number of sequential round-trips regardless of row count (draft-session lookup, assignment rows lookup, week-lock lookup, the "parallel" holidays/leaves/existing-rows/locks lookups — which use `Promise.all` but can't actually run concurrently since they share one transaction connection — plus per-placement-day upsert+create, plus the final ownership/split-index cleanup). Direct measurement showed each round-trip to this remote DB costs roughly 0.5–1.5s even for trivial queries, so ~15-20 fixed round-trips alone approaches the 30s budget before row count even matters.
- **Applied the agreed near-term fix: a longer, route-scoped request timeout** rather than raising the global default (which would mask genuinely hung requests elsewhere). `request-timeout.middleware.ts` now accepts per-route `overrides`; `main.ts` gives `POST /reallocation-requests[/:id/review]`, `POST /regularization-requests/:id/review`, and `PATCH /tasks/:id/status` a 90s budget (`HTTP_SLOW_ROUTE_TIMEOUT_MS`, default 90000) instead of the global 30s (`HTTP_REQUEST_TIMEOUT_MS`). Re-verified the same 5-row handoff end-to-end: completed in 28.4s with a real 200 response (no more save-then-500 for this case). Unrelated routes (e.g. dashboard metrics) confirmed still on the fast default.
- **Still open**: the row-count-independent 15-20 round-trip floor is real latency, not just a timeout-config workaround away — if reallocations start regularly needing >90s (e.g. many more scheduled slices, or DB latency degrading further), the same trap recurs. The `Promise.all` block that can't actually parallelize (single tx connection) is the next place to look if this needs to get faster rather than just more patient. The save-then-500 trap itself (client sees an error for a write that actually succeeded) is still possible in principle on any endpoint that exceeds its budget — a "still processing" response instead of a bare error would close that gap structurally, independent of how fast any individual endpoint is.

## Bugs found and fixed — session 3 (2026-09-17)

Continued from session 2's perf work; these turned up while finishing the remaining "not yet tested" list.

18. **`placeOverflowCapacity()` in `scheduler-assignments.service.ts` (~line 2907) ignored destination week locks.** It loaded holidays, approved leave, and per-designer weekend day-locks before choosing where to place overflow hours, but never checked `SchedulerWeek.isLocked` for the candidate week — unlike `applyReallocationHandoff`'s pack loop, which has that exact guard. Reproduced directly: locked a week, forced overflow into it via a normal week-save, and confirmed two new scheduler rows landed in the locked week anyway. This was the previously-flagged open issue ("overflow placement doesn't check dest-week lock state") — now confirmed and fixed by loading locked weeks for the lookahead range up front and skipping any locked candidate week in the day-walk loop, the same pattern `applyReallocationHandoff` already used. Re-verified: overflow now correctly skips a locked week entirely and lands on the next open one, with zero rows written into the locked week.
19. **`detachAssignmentPart()` (~line 2823) hit `P2028` (Prisma interactive-transaction timeout) on any task with several scheduled parts.** It already had an explicit `{ timeout: 15_000 }` on its transaction (unlike bug from session 2, this one wasn't missing that setting) but still exceeded it, because — same root pattern as `applyReallocationHandoff` before the session-2 fix — its final split-index recompute did one sequential `await tx.schedulerAssignment.update(...)` per remaining part inside a `Promise.all` that can't actually run concurrently on a single transaction connection. Reproduced directly: detaching one part of a 10-part task 500'd with `P2028`. Fixed with a new `batchUpdateSplitIndicesWithParents()` helper (a CASE-keyed single `UPDATE`, like session 2's `batchUpdateSplitIndices()` but supporting a differing `parentId` per row, which this call site needs and the other didn't). Re-verified: same 10-part detach now completes in 5.5s.
20. **`resolveNonTaskProject()` in `regularization-requests.service.ts` (~line 502) made the entire non-task regularization feature 500 on every request, not just bad input.** Its fallback lookup did `findFirst({ where: { OR: [{ projectNo: key }, { id: key }] } })` unconditionally — but `id` is a SQL Server `uniqueidentifier` column, and comparing it against a non-GUID key (the normal case: callers pass a `projectNo` like `"BRI UAE-J29789-09-26"`) throws `P2023` ("Inconsistent column data") before SQL Server even gets to evaluate the `projectNo` half of the OR. Reproduced directly: every non-task regularization create attempt failed with `P2023`, including ones with a perfectly valid `projectNo`. Fixed by only including the `id` clause when the key is actually a UUID (`isUuidString(key) ? { id: key } : { projectNo: key }`), matching the `isUuidString` guard already used earlier in the same function. Re-verified: non-task regularization now creates successfully end-to-end.

### Also resolved: the original "54s regularization create" mystery from session 1

Re-tested `POST /regularization-requests` (create) directly and it took **54.4s** — reproducing session 1's original unexplained outlier almost exactly. This closes that open question: it was never the stale zombie Node processes (those were real and worth cleaning up, but a red herring for this specific number) — it's the same round-trip-heavy pattern documented under "Known but unresolved — session 2," just previously unmeasured on the create path. Added `POST /regularization-requests` (create, not just `/:id/review`) to the same 90s route-scoped timeout override in `main.ts` so it gets a real response instead of a 503 while the underlying round-trip count is still unaddressed.

## Tested and confirmed working — session 3 additions

| Flow | Role(s) tested as | Notes |
|---|---|---|
| Overtime: withdraw | Designer (true self-submit, not HOD-auto-approved) | Full DRAFT → submit → SUBMITTED → withdraw → WITHDRAWN cycle confirmed |
| Scheduler overflow placement (day overflow → next available day, cross-week) | HOD | Confirmed correct placement and persistence; also confirmed the week-lock bug (#18) and its fix |
| Scheduler fragment/split-task handling: detach part → UNASSIGNED, flip fragment status, resolve fragment back onto grid | HOD | Full cycle confirmed; detach also surfaced and fixed bug #19 |
| Regularization: non-task type create | Designer | Broken end-to-end before bug #20's fix; works now, including the `[NON-TASK] Project: ...` note formatting |
| Regularization: no de-dup guard on create | Designer | Submitting two regularization requests for the same designer/date/type both succeeded — appears to be by design (no "one pending" constraint here, unlike reallocation/overtime), not a bug |
| Regularization: `listTaskOptions` de-dup-by-task-id logic | — (code review, not live repro) | The direct `POST /scheduler-assignments/week/:weekStart` save endpoint actively rejects a duplicate same-task/same-day row ("Duplicate assignment row..."), so this Map-based dedup in `listTaskOptions` only matters for rows created via other internal paths (e.g. reallocation's logged-remainder + new-placement split). Reviewed the code directly — a correct `Map` keyed by `task.id` — rather than spending more effort forcing a live repro for low incremental value |
| Task revision numbering (`GET /tasks/next-revision`) | HOD | Correct when scoped with `projectId` (R0 → R1 confirmed for a project with an existing task). Without `projectId`, resolves the project from `opNo` alone, which can be ambiguous if the same `opNo` exists across multiple projects — expected caller responsibility (the create-task flow normally supplies project scoping), not flagged as a bug |

## Frontend bugs found and fixed — session 3, live browser click-through (2026-09-17)

User was driving the actual UI (not API calls) and caught this live: on the Retail Task Creation modal, logged in as SALESPERSON, the "Select HOD" dropdown showed only the placeholder — no HODs listed — despite 19 HOD accounts existing and the backend endpoint (`GET /users?role=HOD`) returning them correctly (verified directly).

21. **Root cause: every `/users?role=X` (and `/users/:id`) response uses `{ id, userName, role }`, but a whole family of frontend components read `.fullName` instead — a field that endpoint has never sent.** Because the components' render logic does `if (!name) return null` or falls through an `||` chain, the failure was silent: no error, no empty-state message, just options/names that never appear. Same root pattern as backend bugs #7/#8/#16 earlier in this doc (a renamed/wrong field silently swallowed), just never caught because nothing throws. Traced and fixed **8 call sites** across the frontend:
    - `CreateTaskModal.jsx` (~line 532) — the HOD dropdown that surfaced this, in the retail task creation flow. **User-reported, live in the browser.**
    - `TaskDetailsPage.jsx` (~line 1838-1848 fetch, plus render at 362/417/421) — Technical Head / Team Lead / Sub Team Lead dropdowns and the Designers multi-select checkbox list, in the task creation/detail team-assignment section. Fixed by normalizing `fullName` onto the fetched user objects once, since multiple reusable components consume this state.
    - `TaskDetailsPage.jsx` (~lines 815-816, 1211-1213) and `RetailProjectPage.jsx` (~line 282-286) — the assignee/designers column in task list and detail views. Was falling through to a garbled joined-empty-string instead of either the real name or the intended `'Unassigned'` fallback.
    - `DesignSchedulerScreen.jsx` (~line 1071-1072) — **the scheduler grid's own designer list.** Every designer row in the core scheduler screen was rendering the literal string `"Designer"` instead of an actual name, since the fallback (`?? "Designer"`) silently absorbed the bug. Highest-impact fix in this batch — this is the primary screen of the app.
    - `LeavePlannerClient.jsx` (~line 476) and `RequestsClient.jsx` (~line 243) — the HOD-facing designer picker on the leave planner and requests pages.
    - `RequestsClient.jsx` (~line 83, `userToEmployeeOption`) — a shared normalizer whose fallback chain (`fullName ?? name`) didn't cover `userName`/`username` either, so it failed for every real data source in the app, not just the primary miss.
    - `ChatterScreen.jsx` (~line 1219) — `getSession()?.fullName` doesn't exist on the session object (`getSession()` only ever sets `.name`); low practical impact since a `|| "You"` fallback already masked it, but fixed for correctness.
  Confirmed **not** bugs, and left alone: chatter mentions (`ChatterScreen.jsx`, `MentionTextarea.jsx`, `chatter-posts.api.ts`) and reallocation eligible-designers (`TaskReallocationPanel.jsx`, `ReallocationQueuePanel.jsx`, `ReallocationRequestsSection.jsx`) — both backed by endpoints that explicitly map `userName` → `fullName` in their own response DTOs, so those call sites were already correct.
  All fixes verified via `tsc --noEmit` (clean); not yet re-verified by clicking through the actual UI again — next step is for the user (or a browser-driven pass) to confirm the HOD dropdown, team-assignment fields, and scheduler grid now show real names.

## Not yet tested at all

- **Retail vs Project task detail forms** (only status transitions + file upload tested, not the full detail-form fields — e.g. sign-type-specific fields, client info, delivery details)
- **The actual frontend UI** — everything above (all three sessions) was tested by hitting the backend API directly. No browser-based click-through has been done since the migration (forms, scheduler drag-and-drop, routing, etc. all unverified visually). This needs a different testing approach (a browser) than what's been done so far.

## Known infra flakiness (not app bugs)

- `nest start --watch` crashes intermittently on this Windows machine when
  many files change in quick succession (`taskkill` race in its own restart
  logic). Workaround: kill everything on port 7000 and run a plain
  `npm run start:dev` (no watch-triggered rapid restarts) when doing a long
  test session.
- Multiple stale `node.exe` processes accumulate from repeated crashed
  restarts — worth clearing before trusting any performance numbers (see
  the 54s regularization-request outlier above).
