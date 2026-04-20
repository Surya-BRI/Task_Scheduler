# Backend — developer guide

NestJS REST API with Prisma (MSSQL). Global route prefix: **`/api/v1`**.

## Quick reference

| Item | Default |
|------|---------|
| HTTP port | `4000` (`PORT` in `.env`) |
| API base | `http://localhost:4000/api/v1` |
| Health | `GET /api/v1/health` |

## Environment variables

Create `backend/.env` from `backend/.env.example`.

### Required

| Variable | Description |
|----------|-------------|
| `JWT_ACCESS_SECRET` | Secret for signing JWTs (minimum 16 characters). |
| `CORS_ORIGIN` | Allowed browser origin(s), comma-separated URIs. Example: `http://localhost:5000` |
| **Database** | Either `DATABASE_URL` **or** all of `DB_SERVER`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` (optional `DB_PORT`, `DB_ENCRYPT`, `DB_TRUST_SERVER_CERTIFICATE`). |

`DATABASE_URL` format (Prisma CLI uses this):

```text
sqlserver://HOST:1433;database=YOUR_DB;user=USER;password=PASS;encrypt=true;trustServerCertificate=true
```

### Optional

| Variable | Default |
|----------|---------|
| `PORT` | `4000` |
| `API_PREFIX` | `api/v1` |
| `JWT_ACCESS_EXPIRES_IN` | `1d` |
| `NODE_ENV` | `development` |

## Database: two ways to initialise

### A) Prisma (recommended for greenfield)

From `backend/`:

```bash
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

`prisma:seed` creates roles `HOD` / `DESIGNER` and users:

- `hod@company.com` / `Secret123!`
- `designer@company.com` / `Secret123!`

(Hashes are generated with `bcrypt` — correct for login.)

### B) Manual SQL (existing ERP / DBA workflow)

1. Create tables to match `prisma/schema.prisma` (or run your own DDL).
2. Insert roles and users. **Important:** `passwordHash` must be a real **bcrypt** hash for the password you use. A placeholder string will cause `401` on login.

If users were created with a wrong hash, run the fix script in the repo:

- `backend/prisma/fix-passwords-for-login.sql`

Then retry login with password `Secret123!` (or update the script to your chosen password and regenerate hashes — see `backend/scripts/gen-bcrypt.js`).

## Generate a bcrypt hash (local)

From `backend/`:

```bash
node scripts/gen-bcrypt.js "YourPasswordHere"
```

Use the printed `HASH` value in SQL `UPDATE` for `User.passwordHash`.

## Run the API

From repository root:

```bash
npm run dev:backend
```

Or from `backend/`:

```bash
npm run start:dev
```

## Auth endpoints

| Method | Path | Notes |
|--------|------|--------|
| POST | `/api/v1/auth/register` | Create user (role in body) |
| POST | `/api/v1/auth/login` | Returns `accessToken` + `user` |

Protected routes expect header:

```http
Authorization: Bearer <accessToken>
```

## Troubleshooting

### `EADDRINUSE` on port 4000

Another process is using the port. Find the PID:

```powershell
netstat -ano | findstr :4000
```

Stop it (`Stop-Process -Id <PID> -Force`) or set `PORT` to another value in `.env` and point the frontend `NEXT_PUBLIC_API_BASE_URL` at the new port.

### Config error: `CORS_ORIGIN must be a valid uri`

Use full URIs only, e.g. `http://localhost:5000`. Multiple origins: comma-separated, no spaces unless trimmed by app.

### Login returns `401 Invalid credentials`

- User missing or email typo.
- `passwordHash` in SQL is not bcrypt for the password you type. Fix with `fix-passwords-for-login.sql` or `npm run prisma:seed`.

### Prisma: table does not exist

Run migrations or create tables before `prisma:seed`.

## Project layout (backend)

- `src/auth` — login/register, JWT strategy  
- `src/users`, `src/projects`, `src/tasks` — domain modules  
- `src/health` — liveness  
- `src/prisma` — Prisma service  
- `src/common` — guards, decorators, filters  
- `prisma/schema.prisma` — data model  
