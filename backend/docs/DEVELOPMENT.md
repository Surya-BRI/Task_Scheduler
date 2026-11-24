# Backend Development Guide

NestJS REST API with Prisma (SQL Server). Global route prefix defaults to `/api/v1`.

## Quick Reference

| Item | Default |
|------|---------|
| HTTP port | `4000` code default (`PORT`); this repo's `backend/.env` and production use `7000` |
| API base | `http://localhost:<PORT>/api/v1` |
| Health | `GET /api/v1/health` |

## Environment

Create `backend/.env`.

Required:
- `JWT_ACCESS_SECRET` (min 16 chars)
- `CORS_ORIGIN` (comma-separated valid origins)
- Database via:
- `DATABASE_URL`, or
- `DB_SERVER`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` (+ optional `DB_PORT`, `DB_ENCRYPT`, `DB_TRUST_SERVER_CERTIFICATE`)

`DATABASE_URL` format:

```text
sqlserver://HOST:1433;database=YOUR_DB;user=USER;password=PASS;encrypt=true;trustServerCertificate=true
```

Auth (production uses `AUTH_MODE=external` — the ERP portal does the login; see `backend/.env.example` for `EXTERNAL_*` and `ERP_*` options and [ERP_AUTH_MIDDLEWARE.md](ERP_AUTH_MIDDLEWARE.md)).

Other notable optional variables:
- `BACKUP_HOD_REVIEWER_USER_IDS` — comma-separated ERP `userId`s of designers who may stand in for an HOD on the `HOD_REVIEW` step only (see "Backup HOD reviewers" below). Restart to apply.
- `CARRYOVER_ENABLED` — nightly past-due carryover cron, default on (`SCHEDULER_RULES.md` Rule 15).
- `HTTP_REQUEST_TIMEOUT_MS` (30000) / `HTTP_SLOW_ROUTE_TIMEOUT_MS` (90000, reallocation + regularization + `PATCH /tasks/:id/status`).
- `SCHEDULER_HISTORY_RETENTION_MONTHS` (18), `SCHEDULER_SPLIT_RECOMPUTE_WEEK_WINDOW` (26).

Common optional:
- `PORT` (default `4000`)
- `API_PREFIX` (default `api/v1`)
- `JWT_ACCESS_EXPIRES_IN` (default `1d`)

## Local Login & Switching Databases (ERP-Dev ↔ ERP-Live)

Production signs users in through the ERP portal (`AUTH_MODE=external`). For local work there is a
dev-only username/password login that uses the backend's demo-mode `/auth/login` (validates against
`ErpAuthUsers` with bcrypt).

**Local login setup**
1. `backend/.env`: leave `AUTH_MODE` **unset** (with `external` the backend rejects local sign-in) and keep `NODE_ENV=development`.
2. `frontend/.env`: set `NEXT_PUBLIC_ENABLE_DEV_LOGIN=true`. The login page then shows the ERP username/password form instead of the "Go to ERP Sign In" button. The flag only works when `NODE_ENV=development`, so it can never appear in a Vercel/production build.
3. Restart backend and frontend (`npm run dev`), then sign in with an ERP user that exists in the database you are pointed at (ERP-Dev: the `*-UAT` accounts listed in `TESTING_PROGRESS.md`; ERP-Live: real ERP credentials only).
4. Login is throttled to 5 attempts per minute.

**Database switch in `backend/.env`** — keep two grouped blocks with the *same variable names* and toggle by commenting:

```text
# ===== ERP-Dev (ACTIVE) =====          <- top of file, uncommented
DB_SERVER / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD / DB_ENCRYPT / DB_TRUST_SERVER_CERTIFICATE
DATABASE_URL
LIVE_DB_* / LIVE_DATABASE_URL          <- same values as above (one database, one pool)

# ===== ERP-Live (COMMENTED) =====      <- bottom of file, every line prefixed "# "
# DB_* / # DATABASE_URL / # LIVE_DB_* / # LIVE_DATABASE_URL
```

To switch to Live: comment out the ERP-Dev block, uncomment the ERP-Live block, restart the backend. To switch back, do the reverse. Never delete either block. `backend/.env` is gitignored — do not commit it or paste connection strings into docs/chat.

**Safety:** everything you do locally writes to whichever database `DATABASE_URL` names. Do local feature work on ERP-Dev; ERP-Live holds real data (see `PRODUCTION_MIGRATION_PROGRESS.md`). Keep `RUNTIME_SCHEMA_BOOTSTRAP=false` when pointed at Live.

## Prisma in This Backend

### Schema and client
- Source schema: `backend/prisma/schema.prisma`
- Generate client after schema changes:

```bash
npm run prisma:generate
```

If not regenerated, TypeScript errors appear for missing model properties/fields.

### Runtime DB used by PrismaService
- `backend/src/prisma/prisma.service.ts` uses app DB config (`database.url` / `DATABASE_URL`) for Prisma model queries.
- **Production database is ERP-Live** (since 2026-09-25): `ErpTS*` app tables and the ERP tables (`ErpAuth*`, `ErpMaster*`) are in the same database, so `DATABASE_URL` is the only connection needed. `LIVE_DATABASE_URL` is optional; when unset or identical to `DATABASE_URL`, `prisma.live` reuses the main pool.
- Against ERP-Live keep `RUNTIME_SCHEMA_BOOTSTRAP=false` (with `NODE_ENV=development` the app would otherwise run boot-time DDL). Tables are created from `backend/prisma/sql/live-*.sql`, not `migrate deploy`.
- Local dev can point at ERP-Dev or Live; check `backend/.env` before running anything that writes. Details: `PRODUCTION_MIGRATION_PROGRESS.md`.

### Schema changes, migrations and seed

- **No Prisma migration history.** `backend/prisma/migrations/` is empty; `prisma migrate dev/deploy` is not used. Schema changes ship as idempotent SQL files in `backend/prisma/sql/` that are run by hand (e.g. `sqlcmd -i`), plus a matching edit to `schema.prisma` and `npm run prisma:generate`.
- A fresh database is built from `live-create-erpts-tables.sql` + `live-create-erpts-indexes.sql` (see `PRODUCTION_MIGRATION_PROGRESS.md`).
- **`npm run prisma:seed` is broken and obsolete.** `prisma/seed.ts` still calls `prisma.role` and creates local demo/UAT users; the `Role` / `ErpTSUser` tables were retired in the 2026-09 ERP-auth migration. Users and roles come from ERP (`ErpAuthUsers`, `ErpAuthUserRoleMap`, `ErpMasterRole`). The ERP-Dev UAT accounts are listed in `TESTING_PROGRESS.md` (password `Tester@321`).
- **`npm run prisma:setup` / `deploy:bootstrap` are legacy.** `prisma/sql/ensure-erp-ts-foreign-keys.sql` joins the retired `ErpTSUser` table; do not run them against ERP-Live.

## Run API

From repo root:

```bash
npm run dev:backend
```

From `backend/`:

```bash
npm run start:dev
```

## Current Module Scope

`AppModule` currently loads:
- Health
- Auth
- Users
- Departments
- Projects
- Tasks
- Design List
- Regularization Requests
- Overtime Requests
- Reallocation Requests
- Scheduler Assignments
- Scheduler Carryover (nightly past-due cron + HOD trigger — `SCHEDULER_RULES.md` Rule 15)
- Chatter Posts
- Activities
- Requests (Leave)
- Dashboard
- Chat (Conversations)
- Notifications
- Deadline Alerts (cron: deadline reminder / overdue notifications)

Plus `ThrottlerModule` (100 req/min default) and `ScheduleModule` (crons).

## Auth Endpoints

- `POST /api/v1/auth/login` — dev-only username/password login (rejected when `AUTH_MODE=external`)
- `POST /api/v1/auth/register` — legacy demo route
- `POST /api/v1/auth/logout` — marks `ErpAuthSession.isLoggedOut`, clears the user's FCM token
- `GET /api/v1/auth/me`
- `GET /api/v1/auth/ws-token` — short-lived (2 min) token for the dashboard Socket.IO connection (used when the frontend is on Vercel)

In production (`AUTH_MODE=external`) the ERP portal sets the session cookies and the backend validates the ERP JWT from them. In demo mode, protected routes accept `Authorization: Bearer <accessToken>`.

## Backup HOD reviewers

Designers listed in `BACKUP_HOD_REVIEWER_USER_IDS` (ERP `userId`s) can cover a busy HOD on the `HOD_REVIEW` step only (`isBackupHodReviewer()` in `common/utils/workflow-roles.util.ts`). They can act on any task already in `HOD_REVIEW` (including issuing REWORK), appear in HOD pick lists, and receive HOD_REVIEW notifications. Everywhere else they are plain designers — no scheduler locks, no leave/OT/HR approvals. Not a separate role.

## Project + File Endpoints

- `GET /api/v1/projects`
- `GET /api/v1/projects/by-project-no/:projectNo`
- `GET /api/v1/projects/:id`
- `POST /api/v1/projects/:id/files`
- `GET /api/v1/projects/:id/files`
- `DELETE /api/v1/projects/:id/files/:fileId`

`GET /api/v1/projects/by-project-no/:projectNo` behavior:
- First checks `ErpTSProject`.
- If missing there, API checks ERP master tables and hydrates `ErpTSProject` on-demand.
- Returns `404` only if project code is not found in either source.

## Split-Task Architecture (Important)

A task is "split" when the HOD assigns it to multiple designers in the scheduler (hours split across days/designers). Key rules that apply everywhere in the codebase:

- `Task.assigneeId` is set to `null` for split tasks. All designers are in `ErpTSTaskDesigner` junction.
- Single-designer tasks keep `assigneeId` populated and may or may not have a junction row.
- **Any query filtering by designer must check both:** `assigneeId = userId` OR `taskDesigners.some({ designerId: userId })`.
- Setting a task to ON_HOLD via `PATCH /tasks/:id/status` deletes its `SchedulerAssignment` rows whose `weekStartDate >= today`, inside one transaction (note: rows in the current week are kept unless today is that week's Monday). An optional `expectedAssignmentIds` guard rejects with 409 if a live row exists outside that set (used by the scheduler's drag-to-hold; the task-detail Hold button omits it on purpose).
- Notifications for status changes (COMPLETED, REWORK) and scheduler saves are sent to all junction-table designers, not just `assigneeId`.
- Work submission (`POST /tasks/:id/submit-work`) builds the submitter display name from the junction when `assigneeId` is null.
- SQL migration: `backend/prisma/sql/add-task-designer-junction.sql`

## Rework vs Client Reject

- **REWORK** (`PATCH /tasks/:id/status` with `status: REWORK`) keeps the **same** task and assignee(s). Instructions (`reworkNote` / attachment / link) are stored on that task. No revision bump and no new task row. Designer can continue (or HOD can reassign via existing flows).
- **CLIENT_REJECTED** marks the old task rejected and **creates a new revision task** (next `R{n}`), cloned from the rejected task, unassigned (`DESIGN_NEW`), with `previousRevisionTaskId` pointing at the old task. Optional reject instructions are copied onto the new revision.
- REWORK may be issued by `HOD`, `SALESPERSON`, `ADMIN`, or a backup HOD reviewer (designer in `BACKUP_HOD_REVIEWER_USER_IDS`). CLIENT_REJECTED is `SALESPERSON` / `ADMIN` only. A salesperson can only change status once the task is in `SALES_REVIEW`.
- **Revision lock (Create Task):** `GET /tasks/next-revision` and create paths (`POST /tasks`, `POST /tasks/extended`) stay on the current **open** revision for the same `projectId` + `opNo` + `designType`. They never mint `R{n+1}` while any non-terminal task exists in that scope. Advancement to the next revision happens **only** via `CLIENT_REJECTED` (which creates a new `DESIGN_NEW` task at `R{n+1}`). If the highest revision is already `CLIENT_REJECTED` and no open successor exists yet, Create Task / next-revision may use `R{n+1}` (reject already authorized the bump). Pure `CLIENT_ACCEPTED` lines still cannot start a new revision from Create Task.

## Task Create Rules (Important)

For `POST /api/v1/tasks/extended`:
- `task.projectName` is required. Backend rejects missing/blank project name with `400`.
- No fallback to task title/default generated project name.
- Existing resolved project names are synced to incoming `task.projectName` when different.
- For project tasks, **one `ErpTSTask` is created per `projectDetails[]` entry**. The frontend sends one entry per ticked discipline per sign type, so selecting Artwork + Technical on a sign type creates 2 tasks.
- Task title is auto-built as `[opNo, signType, disciplineType, revisionCode].join(' - ')`.
- Duplicate detection includes `disciplineType` — same project/opNo/signType/revision is allowed if `disciplineType` differs.
- `dueDate` per task uses `line.deadline` if present, falling back to `dto.task.dueDate`.
- `ProjectDetailInputDto` accepts `signFamily` and `disciplineType` (both optional strings).

## Activity Endpoints

- Team feed compatibility:
  - `GET /api/v1/activities?limit=50`
- Task timeline (new):
  - `GET /api/v1/activities/task/:taskId?limit=30&cursor=<isoDate>`
- Project timeline (new):
  - `GET /api/v1/activities/project/:projectId?limit=30&cursor=<isoDate>`

## Activity Logging Notes

- Activity records are stored in `ErpTSActivityLog`.
- Structured JSON is stored in `details` for new events.
- Current rollout logs:
  - task created
  - task assigned
  - task status changed
  - task file uploaded
  - project file uploaded/deleted
  - chatter post created
  - chatter comment created
- Full coverage list is maintained in:
  - `backend/docs/ACTIVITY_LOG_COVERAGE.md`

## Chatter Endpoints

- `GET /api/v1/chatter-posts?limit=200`
- `GET /api/v1/chatter-posts?taskId=<taskUuid>&limit=200`
- `GET /api/v1/chatter-posts?projectId=<projectUuid>&limit=200`
- Additional filters: `mentionUserId`, `commentedByUserId`, `postType`, `weekStart`
- `GET /api/v1/chatter-posts/mention-users`
- `POST /api/v1/chatter-posts`
  - `message` required
  - `title` optional (backend defaults to `"Chatter Post"` when omitted)
  - Supports multipart (up to 10 files)
- `GET /api/v1/chatter-posts/:postId/comments`
- `POST /api/v1/chatter-posts/:postId/comments`

Chatter list responses include `authorName` and `authorRole`.

## Requests (Leave) Endpoints

- `GET /api/v1/requests` — list own requests (query: `designerId`)
- `GET /api/v1/requests/pending-approvals` — HOD: pending approvals queue
- `GET /api/v1/requests/team-requests` — HOD: team requests (query: `status`, `designerId`)
- `POST /api/v1/requests` — create leave request
- `PATCH /api/v1/requests/:id` — update own request
- `POST /api/v1/requests/:id/cancel` — cancel request (Designer)
- `POST /api/v1/requests/:id/review` — approve/reject request (HOD)
- `POST /api/v1/requests/:id/revoke` — revoke approved request (HOD)
- `PATCH /api/v1/requests/:id/status` — update status (HOD)

## Regularization Request Endpoints

- `GET /api/v1/regularization-requests` — list (query: `designerId`, ERP bigint user id)
- `GET /api/v1/regularization-requests/:id` — get by ID
- `GET /api/v1/regularization-requests/task-options` — tasks available for regularization
- `GET /api/v1/regularization-requests/pending-approvals` — HOD: pending approvals
- `GET /api/v1/regularization-requests/team-requests` — HOD: team requests (query: `status`, `designerId`)
- `POST /api/v1/regularization-requests` — create
- `POST /api/v1/regularization-requests/:id/review` — HOD: review
- `PATCH /api/v1/regularization-requests/:id` — update status

## Overtime Request Endpoints

- `GET /api/v1/overtime-requests` — list for designer (query: `designerId`)
- `GET /api/v1/overtime-requests/:id` — get by ID
- `GET /api/v1/overtime-requests/my-requests` — own requests (query: `status`, `startDate`, `endDate`)
- `GET /api/v1/overtime-requests/pending-approvals` — HOD: pending approvals
- `GET /api/v1/overtime-requests/team-requests` — HOD: team requests (query: `status`, `designerId`)
- `GET /api/v1/overtime-requests/all` — HOD: paginated all (query: `status`, `designerId`, `search`, `page`, `limit`)
- `GET /api/v1/overtime-requests/statistics` — HOD: overtime statistics
- `GET /api/v1/overtime-requests/export` — HOD: export report (query: `status`)
- `POST /api/v1/overtime-requests` — create (optional file attachment)
- `PUT /api/v1/overtime-requests/:id` — update (optional file)
- `POST /api/v1/overtime-requests/:id/submit` — submit request
- `POST /api/v1/overtime-requests/:id/withdraw` — withdraw request
- `POST /api/v1/overtime-requests/:id/attachment` — upload attachment to existing request
- `POST /api/v1/overtime-requests/:id/review` — HOD: review/approve
- `DELETE /api/v1/overtime-requests/:id` — delete

## Notifications Endpoints

- `GET /api/v1/notifications` — user's notifications (query: `limit`)
- `GET /api/v1/notifications/unread-count` — unread count
- `PATCH /api/v1/notifications/:id/read` — mark as read
- `PATCH /api/v1/notifications/:id/unread` — mark as unread
- `POST /api/v1/notifications/read-all` — mark all as read

Model: `ErpTSNotification` (userId, title, message, isRead, linkUrl)

## Chat / Conversations Endpoints

Real-time messaging module. Uses WebSocket gateway (`ChatGateway`) for broadcast events.

REST endpoints:
- `POST /api/v1/conversations` — create DM or group conversation (or retrieve existing DM)
- `GET /api/v1/conversations` — list all conversations for current user
- `GET /api/v1/conversations/:id/messages` — paginated message history (query: `limit`, `before`)
- `POST /api/v1/conversations/:id/messages` — send message (broadcasts `message` event via WebSocket)
- `POST /api/v1/conversations/:id/read` — mark conversation as read (broadcasts `messageRead` event)
- `DELETE /api/v1/conversations/:id` — delete / leave conversation

WebSocket events emitted to room `conv:{conversationId}`:
- `message` — new message broadcast
- `messageRead` — read confirmation broadcast

Models: `ErpTSConversation`, `ErpTSConversationParticipant`, `ErpTSMessage`

## Project Sign Rows / QS Endpoints

Sign rows are **project-scoped** (the old `/tasks/:id/sign-rows` routes were removed in the 2026-06-28 QS refactor):

- `GET /api/v1/projects/:id/sign-rows` — fetch sign rows (HOD, DESIGNER, SALESPERSON, QS)
- `PUT /api/v1/projects/:id/sign-rows` — full-replace (HOD, QS)
- `GET` / `PATCH /api/v1/projects/:id/qs-status` — QS workflow status (HOD, QS)
- `POST /api/v1/projects/:id/qs-submit` — save rows + mark Completed atomically (HOD, QS)

Model: `ErpTSProjectSignRow` (signType, planCode, estQty, qsQty, areaZone, levelParcel, sequence, status, contRef). See `docs/SIGN-ROWS-ARCHITECTURE.md`.

## Reallocation Request Endpoints

`/api/v1/reallocation-requests` — `task-options`, `eligible-designers`, `pending-approvals`, `team-requests`, list, create, `:id/cancel`, `:id/review`. Behaviour: `SCHEDULER_RULES.md` Rule 13; open items: `REALLOCATION_GAPS.md`.

## Scheduler Carryover Endpoints

- `GET /api/v1/scheduler-carryover/last-run` (HOD) — `{ lastRunAt }`
- `POST /api/v1/scheduler-carryover/trigger` (HOD) — run the carryover now

## Troubleshooting

### 500 on API after schema changes
1. Run `npm run prisma:generate`.
2. Restart backend watcher.
3. Verify backend is pointing at intended DB/schema.

### 401 Invalid credentials (dev login)
- `AUTH_MODE=external` is set (local login is rejected), or
- user not found / inactive in `ErpAuthUsers`, has no active mapped role, or
- `ErpAuthUsers.password` is not a bcrypt hash of the supplied password.

### Port conflict

```powershell
netstat -ano | findstr :7000
```

Stop conflicting process or change `PORT` and align frontend `NEXT_PUBLIC_API_BASE_URL`.
