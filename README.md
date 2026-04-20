# Task Scheduler

Monorepo starter for a task scheduling and resource management system: **Next.js** (UI) + **NestJS** (REST API) + **Prisma** + **Microsoft SQL Server**.

## Documentation

| Area | Guide |
|------|--------|
| First-time setup (everyone) | This file (below) |
| Backend (API, DB, auth, Prisma) | [backend/docs/DEVELOPMENT.md](backend/docs/DEVELOPMENT.md) |
| Frontend (Next.js, env, ports) | [frontend/docs/DEVELOPMENT.md](frontend/docs/DEVELOPMENT.md) |

## Prerequisites

- **Node.js** 20 or newer
- **npm** (workspaces enabled at repo root)
- **SQL Server** reachable from your machine (local or remote) for the API database

## Initialise the project (first run)

From the repository root (`task-scheduler/`):

```bash
npm install
```

### 1. Backend environment

Copy the example file and edit values:

```bash
copy backend\.env.example backend\.env
```

Set at least:

- Database: `DATABASE_URL` **or** `DB_SERVER`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` (see [backend/docs/DEVELOPMENT.md](backend/docs/DEVELOPMENT.md))
- `JWT_ACCESS_SECRET` — at least 16 characters
- `CORS_ORIGIN` — must match the frontend origin (default: `http://localhost:5000`)

### 2. Database schema and users

You can either use **Prisma migrations** or **manual SQL** (common when attaching to an existing ERP database). Details and password-hash notes are in [backend/docs/DEVELOPMENT.md](backend/docs/DEVELOPMENT.md).

### 3. Frontend environment

```bash
copy frontend\.env.example frontend\.env.local
```

Adjust `NEXT_PUBLIC_API_BASE_URL` if the API is not on `http://localhost:4000/api/v1`.

### 4. Run in development

Use **two terminals** from the repo root:

```bash
npm run dev:backend
```

```bash
npm run dev:frontend
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5000 |
| Backend API | http://localhost:4000/api/v1 |
| Health check | http://localhost:4000/api/v1/health |

## Root npm scripts

| Script | Purpose |
|--------|---------|
| `npm run dev:backend` | NestJS watch mode |
| `npm run dev:frontend` | Next.js dev server (port 5000) |
| `npm run build` | Build backend then frontend |
| `npm run lint` | Lint both workspaces |
| `npm run typecheck` | TypeScript check both workspaces |

## Repository layout

```
task-scheduler/
  backend/          # NestJS API, Prisma schema, seeds
  frontend/         # Next.js App Router UI
```

Shared role/status constants live under `backend/src/common/constants`.
