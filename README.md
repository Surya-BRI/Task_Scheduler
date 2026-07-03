# Task Scheduler

Monorepo for task scheduling and resource workflows: **Next.js** frontend + **NestJS** backend + **Prisma** + **SQL Server**.

## Documentation

| Area | Guide |
|------|-------|
| Full backend guide (API, Prisma, auth, DB) | [backend/docs/DEVELOPMENT.md](backend/docs/DEVELOPMENT.md) |
| Backend API-table mapping | [backend/docs/API_TABLE_CONNECTIONS.md](backend/docs/API_TABLE_CONNECTIONS.md) |
| Reliability (health, shutdown, cron locks) | [backend/docs/RELIABILITY.md](backend/docs/RELIABILITY.md) |
| Activity log event coverage | [backend/docs/ACTIVITY_LOG_COVERAGE.md](backend/docs/ACTIVITY_LOG_COVERAGE.md) |
| Frontend guide (Next.js env + runtime) | [frontend/docs/DEVELOPMENT.md](frontend/docs/DEVELOPMENT.md) |
| Full repository technical reference | [repo refrence.md](repo%20refrence.md) |

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
- Database via `DATABASE_URL` or DB parts (`DB_SERVER`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, ...)

### 3) Configure frontend env

Create `frontend/.env.local` and set:
- `NEXT_PUBLIC_API_BASE_URL=http://localhost:<PORT>/api/v1`

`<PORT>` must match backend `PORT` in `backend/.env`.

### 4) Prepare Prisma + DB

For a new database (migrations):

```bash
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

For an existing ERP database:

```bash
npm run prisma:setup
npm run prisma:seed
```

You can also use manual SQL when attaching to an existing ERP database. Details and password-hash notes are in [backend/docs/DEVELOPMENT.md](backend/docs/DEVELOPMENT.md).

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
| `npm run prisma:migrate` | Apply Prisma migrations |
| `npm run prisma:seed` | Seed roles and demo users |
| `npm run prisma:setup` | Generate client + ensure tables and foreign keys |
| `npm run prisma:audit-schema` | Report ErpTS tables, FKs, and orphan rows |
| `npm run build` | Build backend then frontend |
| `npm run lint` | Lint both workspaces |
| `npm run typecheck` | TypeScript check both workspaces |

## Prisma Notes (Important)

- Schema source of truth is `backend/prisma/schema.prisma`.
- After any schema edit, regenerate client: `npm run prisma:generate`.
- If watcher still shows old Prisma typing errors, restart backend dev server.
- Backend Prisma runtime uses application DB config (`DATABASE_URL` / `database.url`) for model queries.
