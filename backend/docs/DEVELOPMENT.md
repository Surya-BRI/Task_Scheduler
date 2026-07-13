# Backend Development Guide

NestJS REST API with Prisma (SQL Server). Global route prefix defaults to `/api/v1`.

## Quick Reference

| Item | Default |
|------|---------|
| HTTP port | `4000` (`PORT`) |
| API base | `http://localhost:4000/api/v1` |
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

Common optional:
- `PORT` (default `4000`)
- `API_PREFIX` (default `api/v1`)
- `JWT_ACCESS_EXPIRES_IN` (default `1d`)

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
- Keep ERP live/read-only connection config separate from core Prisma schema DB.

### Migrations and seed

```bash
npm run prisma:migrate
npm run prisma:seed
```

Seed currently upserts:
- Roles: `HOD`, `DESIGNER`
- Demo users with bcrypt-hashed passwords:
- `sarah.mitchell@bluerhine.com` / `hod123`
- `alex.johnson@bluerhine.com` / `alex123`
- `alexander.allen@bluerhine.com` / `alex123`
- `benjamin.harris@bluerhine.com` / `ben123`

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
- Scheduler Assignments
- Chatter Posts
- Activities
- Requests (Leave)
- Dashboard
- Notifications
- Chat (Conversations)

## Auth Endpoints

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`

Protected routes use:

```http
Authorization: Bearer <accessToken>
```

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
- Setting a task to ON_HOLD via `PATCH /tasks/:id/status` automatically deletes all future `SchedulerAssignment` rows.
- Notifications for status changes (COMPLETED, REWORK) and scheduler saves are sent to all junction-table designers, not just `assigneeId`.
- Work submission (`POST /tasks/:id/submit-work`) builds the submitter display name from the junction when `assigneeId` is null.
- SQL migration: `backend/prisma/sql/add-task-designer-junction.sql`

## Rework vs Client Reject

- **REWORK** (`PATCH /tasks/:id/status` with `status: REWORK`) keeps the **same** task and assignee(s). Instructions (`reworkNote` / attachment / link) are stored on that task. No revision bump and no new task row. Designer can continue (or HOD can reassign via existing flows).
- **CLIENT_REJECTED** marks the old task rejected and **creates a new revision task** (next `R{n}`), cloned from the rejected task, unassigned (`DESIGN_NEW`), with `previousRevisionTaskId` pointing at the old task. Optional reject instructions are copied onto the new revision.
- Only `SALESPERSON` or `ADMIN` may issue REWORK or CLIENT_REJECTED.

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

- `GET /api/v1/regularization-requests` — list (query: `designerId` UUID)
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

## Task Sign Rows Endpoints

- `GET /api/v1/tasks/:id/sign-rows` — fetch project sign rows
- `PUT /api/v1/tasks/:id/sign-rows` — bulk save/update sign rows

Model: `ErpTSProjectSignRow` (signType, planCode, estQty, qsQty, areaZone, levelParcel, sequence, status, contRef)

## Troubleshooting

### 500 on API after schema changes
1. Run `npm run prisma:generate`.
2. Restart backend watcher.
3. Verify backend is pointing at intended DB/schema.

### 401 Invalid credentials
- User not found, or
- `passwordHash` in DB is not a bcrypt hash for supplied password.

### Port conflict

```powershell
netstat -ano | findstr :4000
```

Stop conflicting process or change `PORT` and align frontend `NEXT_PUBLIC_API_BASE_URL`.
