# Task Scheduler

Monorepo for task scheduling and resource workflows: **Next.js** frontend + **NestJS** backend + **Prisma** + **SQL Server**.

## Documentation

| Area | Guide |
|------|-------|
| Full backend guide (API, Prisma, auth, DB) | [backend/docs/DEVELOPMENT.md](backend/docs/DEVELOPMENT.md) |
| Frontend guide (Next.js env + runtime) | [frontend/docs/DEVELOPMENT.md](frontend/docs/DEVELOPMENT.md) |
| Full repository technical reference | [repo refrence.md](repo%20refrence.md) |

## Prerequisites

- Node.js `>=20`
- npm workspaces
- Reachable SQL Server instance

## Quick Start

From repo root:

```bash
npm install
```

### 1) Configure backend

Create `backend/.env` and set at minimum:
- `JWT_ACCESS_SECRET`
- `CORS_ORIGIN` (usually `http://localhost:5000`)
- Database via `DATABASE_URL` or DB parts (`DB_SERVER`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, ...)

### 2) Prepare Prisma + DB

```bash
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

### 3) Configure frontend

Create `frontend/.env.local` and set:
- `NEXT_PUBLIC_API_BASE_URL=http://localhost:<PORT>/api/v1`

`<PORT>` must match backend `PORT` in `backend/.env`.

### 4) Run dev

```bash
npm run dev
```

or separately:

```bash
npm run dev:backend
npm run dev:frontend
```

## URLs

- Frontend: `http://localhost:5000`
- Backend API: `http://localhost:<PORT>/api/v1`
- Health: `http://localhost:<PORT>/api/v1/health`

## Root Scripts

- `npm run dev`
- `npm run dev:backend`
- `npm run dev:frontend`
- `npm run prisma:generate`
- `npm run prisma:migrate`
- `npm run prisma:seed`
- `npm run build`
- `npm run lint`
- `npm run typecheck`

## Prisma Notes (Important)

- Schema source of truth is `backend/prisma/schema.prisma`.
- After any schema edit, regenerate client: `npm run prisma:generate`.
- If watcher still shows old Prisma typing errors, restart backend dev server.
- Backend Prisma runtime uses application DB config (`DATABASE_URL` / `database.url`) for model queries.
