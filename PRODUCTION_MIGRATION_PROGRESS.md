# Production Migration Progress — ERP-Dev → ERP-Live

_Last updated: 2026-09-25 (app live on ERP-Live; first writes verified)_

Goal: stop splitting reads (ERP-Live) from writes (ERP-Dev). All Scheduler tables
(`ErpTS*`) now live in **ERP-Live**, and the app reads and writes one database.

> No credentials in this doc. Connection strings live only in each host's `.env`
> (local `backend/.env`, server `~/bri-erp-api/task-scheduler/.env`). Rotate any password
> that has been pasted into chat or a ticket.

## Before / after

| | Before | After |
|---|---|---|
| App tables (`ErpTS*`) | ERP-Dev (`13.234.241.125`) | **ERP-Live** (`65.2.162.104`) |
| Login tables (`ErpAuth*`, `ErpMaster*`) | ERP-Dev copy | ERP-Live (the real ones) |
| ERP master reads (design list, salesperson, project hydration) | ERP-Live via `LIVE_DATABASE_URL` (read-only `Reader` login) | unchanged; same database as the main connection |
| Main `DATABASE_URL` login | Dev admin | Live write login (currently a sysadmin login — see Open items) |

## Checklist

Legend: ✅ done · ⏳ in progress · ⬜ not started · ⛔ blocked / needs an answer

### 1. Preparation
- ✅ Reviewed recent commits, docs, table inventory (44 Prisma models: 42 `ErpTS*` to create; `ErpAuthUsers` is ERP-owned and `Department` is legacy — neither created)
- ✅ Found: `prisma/migrations/` is empty; schema history is loose SQL in `backend/prisma/sql/`, so the CREATE script is generated from `schema.prisma` instead of `migrate deploy`
- ✅ Found: with `NODE_ENV=development` the app runs boot-time DDL (`RUNTIME_SCHEMA_BOOTSTRAP`); must be `false` against Live

### 2. Read-only checks on ERP-Live
- ✅ Write login works; it is sysadmin/db_owner on ERP-Live (SQL Server 2022, FULL recovery, ~47 GB)
- ✅ No `ErpTS*` tables existed (no name collisions)
- ✅ ERP tables the app depends on exist with the expected columns: `ErpAuthUsers`, `ErpAuthUserRoleMap`, `ErpMasterRole`, `ErpAuthSession`, `ErpMasterEmployee`, `Middlewares` (id 3 = Task Scheduler), `ErpMasterProject`, `ErpMasterOpportunity`
- ✅ Live roles: Design HOD 1, Design Head 1, Designer 18, Sales Coordinator 20, SalesRep 61, **QS 0**

### 3. Create the tables
- ✅ Generated SQL with `prisma migrate diff --from-empty --to-schema-datamodel`, removed `ErpAuthUsers` / `Department`
- ✅ Compared generated columns with ERP-Dev: only differences are Dev-only leftovers the code never references (see below)
- ✅ Ran `backend/prisma/sql/live-create-erpts-tables.sql` — **42 tables, 32 foreign keys**, one transaction
- ✅ Ran `backend/prisma/sql/live-create-erpts-indexes.sql` — filtered unique index `UQ_ErpTSReallocationRequest_pending_task_requester` (needs `sqlcmd -I` for QUOTED_IDENTIFIER)
- ✅ Verified: 42 tables, 32 FKs, 0 rows
- ✅ Rollback script written (not run): `backend/prisma/sql/live-rollback-erpts-tables.sql`
- ℹ️ No full backup taken first — only new tables were created, nothing existing was altered

**Decisions taken while creating**
- **No foreign keys into `ErpAuthUsers`.** 40 constraints in the generated script referenced it; all were dropped so nothing here can block or cascade into ERP's user table. Every other FK is kept. User ids are validated in the app.
- **Dev-only objects not copied** (unused by any code, no DB object references them): tables `ErpTSUser`, `ErpTSRole`, `ErpTSChatter`, `ErpTSSchedulerLeaveDisplacement`; columns `ErpTSProject.isActive`, `ErpTSSchedulerAssignment.overtimeHours`, `ErpTSTask.revisionScopeHash`. All three columns are nullable or defaulted, so their absence cannot break inserts. If anyone outside this repo uses them, adding them to Live later is one ALTER/CREATE.
- **Nothing copied from Dev.** Dev rows are UAT data keyed by Dev user ids that do not exist in Live. Live starts empty.

### 4. Point the app at Live
- ✅ Local `backend/.env` switched to Live (old file kept outside the repo)
- ✅ Server `.env` has `DATABASE_URL` on Live, `RUNTIME_SCHEMA_BOOTSTRAP=false`, `NODE_ENV=production`, `EXTERNAL_SESSION_COOKIE=session_id`
- ✅ Backend restarted on the server (pm2 process 59, 2026-09-25 12:29 IST); boot log clean — "Skipping scheduler / chatter / leave-request runtime DDL", "Nest application successfully started"
- ✅ `GET /api/v1/health` → 200; `GET /api/v1/health/ready` → 200, database check `ok` (2 ms) — the server is connected to Live
- ✅ Logged in through the ERP portal; Design List loads (confirmed by user, 2026-09-25)
- ✅ Verified writes land in Live: `ErpTSProject` 2 rows (hydrated from `ErpMasterProject` on first open), plus 1 `ErpTSTask` with its `ErpTSRetailTaskDetail`, 3 `ErpTSActivityLog`, 2 `ErpTSNotification` — project hydration, task creation, activity log and notifications all write to ERP-Live
- ✅ **Step 4 complete — the app is running on ERP-Live.**

### 5. Frontend (Vercel project `task-scheduler`)
- ✅ Confirmed hosts: backend = `task-scheduler.app-brisigns.com` (nginx/Ubuntu); frontend = `designscheduler.app-brisigns.com` (Vercel, proxies `/api/v1` to the backend)
- ✅ `COOKIE_DOMAIN`, `EXTERNAL_LOGOUT_COOKIES`, `NEXT_PUBLIC_WS_ORIGIN`, `NEXT_PUBLIC_API_BASE_URL` already correct; no database-related change needed in Vercel
- ⛔ Add `ERP_LOGOUT_URL` (server-only, no `NEXT_PUBLIC_` prefix): needs the ERP `auth_logout` base URL — get it from the browser Network tab when clicking the ERP's own Sign Out
- ✅ Live ERP host is `https://app-brisigns.com` (dev ERP: `dev.app-brisigns.com`); `/home` and `/auth/login` both exist on it. Repo defaults in `frontend/src/lib/env.ts` and the `.env.example` files now point at the live host (2026-09-25)
- ⬜ In Vercel set `NEXT_PUBLIC_ERP_HOME_URL=https://app-brisigns.com/home` (currently `https://dev.app-brisigns.com/home`), and `NEXT_PUBLIC_ERP_LOGIN_URL=https://app-brisigns.com/auth/login` if set
- ⬜ Server `CORS_ORIGIN`: add `https://app-brisigns.com` (currently lists `dev.app-brisigns.com`, not the live host); keep dev until the cutover is finished
- ✅ Live ERP logout endpoint verified 2026-09-25: `GET https://api.app-brisigns.com/api/auth/auth_logout/0` → 200 `"It's already logged out."` (probed with the non-existent session id 0, so nothing was logged out; the first call timed out at 15 s, the retry answered in 1.7 s — slow on a cold call, keep the 4 s timeout in mind, the route treats it as best-effort). Dev equivalent `dev-api…` behaves identically. Value for Vercel: `ERP_LOGOUT_URL=https://api.app-brisigns.com/api/auth/auth_logout`
- ✅ Code fallback added in `frontend/src/app/api/auth/logout/route.ts`: production builds default `ERP_LOGOUT_URL` to `https://api.app-brisigns.com/api/auth/auth_logout` when the variable is unset (local dev stays opt-in). Vercel Preview builds also count as production, so they would hit the live ERP logout too. Type-check clean; not yet deployed
- ✅ Backend `/health/ready` → 200, database `ok` (2 ms); direct SQL connection to ERP-Live works, 42 `ErpTS*` tables present
- ℹ️ Cookie check (2026-09-25): user ids stored on new Live rows (1 = DennyJoseph, 216 = Gopan, 204 = Alekhya) match real Live `ErpAuthUsers`, so logins are producing Live ids, not Dev ids
- ⬜ Redeploy on Vercel after adding variables

### 6. Verify logout end to end
- ⬜ Sign Out: logs show `[logout] backend /auth/logout -> 200` and `[logout] ERP auth_logout -> 200`
- ⬜ `ErpAuthSession.isLoggedOut = 1` and `ErpAuthUsers.fcmToken` cleared for that session

### 7. Performance check on Live
- ⬜ Time one scheduler week save and one reallocation create. In Dev, writes cost 15–20 round-trips at 0.5–1.5 s each, with 90 s route-scoped timeouts (see `TESTING_PROGRESS.md`). Live is a different server; confirm the timeouts are still enough.

## Open items / decisions

| # | Item | State |
|---|---|---|
| 1 | Replace the sysadmin login in `DATABASE_URL` with a limited login (read/write on `ErpTS*`, read on the ERP tables it uses) | ⬜ recommended before others use the app |
| 2 | Rotate secrets that were pasted in chat: the Live write login password, the AWS key for the production bucket, the `Reader` password, the JWT secret | ⬜ |
| 3 | QS role has no users in Live; new projects auto-assign QS users, so none will be assigned until ERP admins create QS users/role | ⛔ needs ERP admin |
| 4 | Login does not check `ErpMasterEmployee.isAllowLogin` / `defaultMiddleware` | decided: leave as is (2026-09-25). With `AUTH_MODE=external` the ERP portal's own login gate decides who gets a token |
| 5 | `EXTERNAL_ROLE_MAP` on the server also maps ADMIN and SUB ADMIN to HOD, so more people than the two Design HOD/Head accounts can act as HOD | ℹ️ confirm intended |
| 6 | `LOG_LEVEL=debug` on the production server (boot log still prints DEBUG lines) | ⬜ suggest `info` |
| 10 | Server runs Node v20.14.0; the AWS SDK warns it will require Node >=22 for releases after the first week of January 2027 | ⬜ plan an upgrade before then (not urgent) |
| 7 | Backups: confirm the new tables are covered by Live's backup job | ⬜ |
| 8 | Update stale docs (`backend/docs/API_TABLE_CONNECTIONS.md`, `repo-reference.md`, `backend/docs/KNOWN_GAPS.md` item 1 — the overflow week-lock gap was fixed 2026-09-17) | ⬜ |
| 9 | Commit the three `live-*.sql` scripts (currently untracked) | ⬜ |

## Rollback

- **Undo the table creation:** run `backend/prisma/sql/live-rollback-erpts-tables.sql` (drops only the 42 `ErpTS*` tables; destroys any data in them). Safe only while no real data has been entered.
- **Point the app back at Dev:** restore the previous `DATABASE_URL` / `DB_*` values (local: the saved `.env` copy) and restart.
