# Task Scheduler

Monorepo for task scheduling and resource workflows: **Next.js** frontend + **NestJS** backend + **Prisma** + **SQL Server**.

> **Database:** production runs on **ERP-Live** (since 2026-09-25) and logs users in through the ERP portal (`AUTH_MODE=external`). Users are ERP users (`ErpAuthUsers`), not local accounts, so `prisma:seed` demo users no longer apply. See [PRODUCTION_MIGRATION_PROGRESS.md](PRODUCTION_MIGRATION_PROGRESS.md).

## Documentation

| Area | Guide |
|------|-------|
| Full backend guide (API, Prisma, auth, DB) | [backend/docs/DEVELOPMENT.md](backend/docs/DEVELOPMENT.md) |
| Backend API-table mapping | [backend/docs/API_TABLE_CONNECTIONS.md](backend/docs/API_TABLE_CONNECTIONS.md) |
| Reliability (health, shutdown, cron locks) | [backend/docs/RELIABILITY.md](backend/docs/RELIABILITY.md) |
| DevOps (Docker, CI/CD, logging, tracing) | [backend/docs/DEVOPS.md](backend/docs/DEVOPS.md) |
| Activity log event coverage | [backend/docs/ACTIVITY_LOG_COVERAGE.md](backend/docs/ACTIVITY_LOG_COVERAGE.md) |
| Frontend guide (Next.js env + runtime) | [frontend/docs/DEVELOPMENT.md](frontend/docs/DEVELOPMENT.md) |
| API load & efficiency playbook | [API_LOAD_EFFICIENCY_PLAYBOOK.md](API_LOAD_EFFICIENCY_PLAYBOOK.md) |
| ERP-Live cutover checklist and rollback | [PRODUCTION_MIGRATION_PROGRESS.md](PRODUCTION_MIGRATION_PROGRESS.md) |
| ERP auth & middleware (Scheduler) | [backend/docs/ERP_AUTH_MIDDLEWARE.md](backend/docs/ERP_AUTH_MIDDLEWARE.md) |
| ERP auth & middleware (generic) | [docs/ERP_MIDDLEWARE_INTEGRATION.md](docs/ERP_MIDDLEWARE_INTEGRATION.md) |
| UAT / smoke-test log | [TESTING_PROGRESS.md](TESTING_PROGRESS.md) |
| Scheduler behaviour rules | [SCHEDULER_RULES.md](SCHEDULER_RULES.md) |
| Deploy steps (WinSCP + PM2) | [DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md) |
| Open gaps | [backend/docs/KNOWN_GAPS.md](backend/docs/KNOWN_GAPS.md), [backend/docs/REALLOCATION_GAPS.md](backend/docs/REALLOCATION_GAPS.md) |
| Full repository technical reference | [repo-reference.md](repo-reference.md) |

## Recent Feature Notes

- Activity timeline supports:
  - `GET /api/v1/activities/task/:taskId`
  - `GET /api/v1/activities/project/:projectId`
- Chatter supports project-scoped listing:
  - `GET /api/v1/chatter-posts?projectId=<projectUuid>&limit=<n>`
- Chatter payload includes author metadata for UI labels:
  - `authorName`, `authorRole`
- Project lookup endpoint now supports ERP fallback hydration:
  - `GET /api/v1/projects/by-project-no/:projectNo`
  - If project code exists in ERP master tables but is missing in `ErpTSProject`, API auto-creates an app project row and returns it.
- Extended task create now requires source project name:
  - `POST /api/v1/tasks/extended`
  - `task.projectName` is required (no fallback to task title/default project name).

## Prerequisites

- Node.js `>=20`
- npm workspaces
- Reachable SQL Server instance

## Setup Commands

Run all commands from repo root, in this order.

### 1) Install dependencies

```bash
npm install
```

### 2) Configure backend env

Create `backend/.env` and set at minimum:
- `JWT_ACCESS_SECRET`
- `CORS_ORIGIN` (usually `http://localhost:5000`)
- `PORT` — this repo's local setup uses `7000` (code default is `4000`)
- Database via `DATABASE_URL` or DB parts (`DB_SERVER`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, ...)

### 3) Configure frontend env

Create `frontend/.env.local` and set:
- `NEXT_PUBLIC_API_BASE_URL=http://localhost:<PORT>/api/v1`

`<PORT>` must match backend `PORT` in `backend/.env`.

### 4) Prepare Prisma + DB

```bash
npm run prisma:generate
```

That is normally all you need: local work points at ERP-Dev or ERP-Live, where the `ErpTS*` tables already exist.

For a **brand-new** SQL Server database, create the schema from the SQL scripts (not `prisma migrate` — `backend/prisma/migrations/` is empty):

```bash
sqlcmd ... -i backend/prisma/sql/live-create-erpts-tables.sql
sqlcmd ... -I -i backend/prisma/sql/live-create-erpts-indexes.sql   # -I = QUOTED_IDENTIFIER, needed for the filtered index
```

The ERP-owned tables (`ErpAuthUsers`, `ErpAuthUserRoleMap`, `ErpMasterRole`, `ErpAuthSession`, `ErpMasterEmployee`, `ErpMasterProject`, `ErpMasterOpportunity`, `Middlewares`) must already exist in that database.

> **Legacy scripts — do not use:** `npm run prisma:seed`, `prisma:setup` and `deploy:bootstrap` still target the retired local `ErpTSUser` / `ErpTSRole` tables and fail against the current schema. Users come from ERP. See [backend/docs/DEVELOPMENT.md](backend/docs/DEVELOPMENT.md).

### 5) Run development servers

```bash
npm run dev
```

Or run separately:

```bash
npm run dev:backend
npm run dev:frontend
```

## URLs

- Frontend: `http://localhost:5000`
- Backend API: `http://localhost:<PORT>/api/v1`
- Health: `http://localhost:<PORT>/api/v1/health`

## Root Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | NestJS + Next.js in one terminal (`concurrently`) |
| `npm run dev:backend` | NestJS watch mode |
| `npm run dev:frontend` | Next.js dev server (port 5000) |
| `npm run prisma:generate` | Generate Prisma client |
| `npm run prisma:migrate` | `prisma migrate dev` — not used (no migration history; schema changes ship as SQL in `backend/prisma/sql/`) |
| `npm run prisma:seed` | **Legacy, broken** — seeds the retired local role/user tables |
| `npm run prisma:setup` | **Legacy** — ensure scripts reference the retired `ErpTSUser` table; don't run against ERP-Live |
| `npm run prisma:audit-schema` | Report ErpTS tables, FKs, and orphan rows |
| `npm run build` | Build backend then frontend |
| `npm run lint` | Lint both workspaces |
| `npm run typecheck` | TypeScript check both workspaces |

## Prisma Notes (Important)

- Schema source of truth is `backend/prisma/schema.prisma`.
- After any schema edit, regenerate client: `npm run prisma:generate`.
- If watcher still shows old Prisma typing errors, restart backend dev server.
- Backend Prisma runtime uses application DB config (`DATABASE_URL` / `database.url`) for model queries.
