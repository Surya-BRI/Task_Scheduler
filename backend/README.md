# Backend (NestJS)

REST API for Task Scheduler: **auth**, **users**, **projects**, **tasks**, **health**, **Prisma** (MSSQL).

## Full setup guide

See **[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)** — environment variables, database init, Prisma, seeds, auth, and troubleshooting.

## Quick start

```bash
# from repo root
copy backend\.env.example backend\.env
# edit backend\.env — JWT, DB, CORS

npm install
npm run prisma:generate --workspace backend
npm run prisma:migrate --workspace backend
npm run prisma:seed --workspace backend

npm run dev:backend
```

API: `http://localhost:4000/api/v1` · Health: `GET /api/v1/health`

## Module map

| Folder | Role |
|--------|------|
| `src/auth` | Register, login, JWT |
| `src/users` | Users (HOD-protected create/list) |
| `src/projects` | Projects |
| `src/tasks` | Tasks, assign, status |
| `src/health` | Health check |
| `src/prisma` | Database client |
| `src/common` | Guards, decorators, filters |
| `prisma/` | `schema.prisma`, seeds, SQL helpers |
