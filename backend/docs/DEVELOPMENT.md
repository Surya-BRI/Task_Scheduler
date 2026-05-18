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

## Auth Endpoints

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`

Protected routes use:

```http
Authorization: Bearer <accessToken>
```

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
