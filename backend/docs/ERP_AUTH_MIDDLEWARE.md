# ERP Authentication & Middleware Integration

Reference for how Scheduler login was bridged to ERP's own auth tables, what
`ErpMasterEmployee`/`Middlewares` look like on the ERP side, what's wired up
today vs. still open, and the test queries used to verify all of it. Read
this before touching `auth.service.ts`, `users.service.ts`, or anything in
the eventual middleware-portal handoff.

## 1. Background

Scheduler used to have its own local `ErpTSUser` table (GUID identity,
password hash owned by Scheduler). That's gone. Login now validates directly
against ERP's own auth tables, and every business table that used to FK to
the local GUID user now FKs to ERP's **bigint `userId`** instead. See
`TESTING_PROGRESS.md` for the full re-keying migration and its UAT smoke-test
log; this doc only covers the auth/middleware slice.

## 2. Current login flow

```
POST /auth/login { email, password }   ← "email" field, but it's really the ERP userName
  → AuthService.login()
      → UsersService.validateErpLogin(userName, password)
```

`validateErpLogin` (`backend/src/users/users.service.ts:33`):

```sql
SELECT TOP 1 u.userId, u.userName, u.password, r.roleName
FROM ErpAuthUsers u
JOIN ErpAuthUserRoleMap m ON m.userId = u.userId AND m.isActive = 1
JOIN ErpMasterRole r ON r.roleId = m.roleId AND r.isActive = 1 AND r.isDeleted = 0
WHERE u.userName = @userName AND u.isActive = 1 AND u.isDeleted = 0
ORDER BY m.mapId DESC
```

- Password is `bcrypt.compare`d against `ErpAuthUsers.password`.
- ERP's `roleName` is mapped to a Scheduler `UserRole` via a hardcoded
  `ERP_ROLE_MAP` (Design HOD/Design Head → HOD, SalesRep/Sales Coordinator →
  SALESPERSON, Designer → DESIGNER, QS → QS). Unmapped roles can't log in.
- No local shadow account is created. The returned `userId` (bigint) is the
  identity used everywhere else in the app — the Prisma `ErpUser` model
  (`@@map("ErpAuthUsers")`) is a read-only reference onto it.
- **`ErpMasterEmployee` is not joined anywhere in this flow.** That's the gap
  this doc is mainly about.

## 3. `ErpMasterEmployee` / `Middlewares` schema (ERP-Dev)

Queried directly against ERP-Dev via `sqlcmd` (connection details in
`backend/.env` → `DATABASE_URL`). Columns relevant to auth/middleware:

| Column | Type | Notes |
|---|---|---|
| `employeeId` | bigint, IDENTITY (PK) | don't supply on INSERT |
| `firstName` / `lastName` | varchar | display name |
| `isAllowLogin` | bit | separate login gate — **not currently enforced by Scheduler** |
| `isActive` | bit | |
| `userId` | bigint | → `ErpAuthUsers.userId` |
| `departmentId` | bigint, nullable | **frequently NULL even for active login-enabled employees** — don't build logic that assumes it's populated |
| `defaultMiddleware` | bigint | → `Middlewares.id` |

`Middlewares` lookup table:

| id | code | name |
|---|---|---|
| 1 | ERP | ERP |
| 2 | Analytics | Analytics |
| 3 | Task Scheduler | Task Scheduler |

**The intent:** `ErpMasterEmployee.defaultMiddleware` is presumably how the
company's separate middleware portal will decide which app a logged-in ERP
user lands in. `id = 3` is Task Scheduler. Nothing on the Scheduler side
reads this yet — see §5.

## 4. UAT data fix (2026-09-17)

The 13 UAT test accounts (`ErpAuthUsers.userName` like `%-UAT`, listed in
`TESTING_PROGRESS.md`) live in `ErpAuthUsers` but most had no
`ErpMasterEmployee` row at all, so they had no `defaultMiddleware`. Fixed by:

1. Checked which UAT users already had a row — only `Chithira-UAT`
   (`employeeId 2280`, pre-existing, `defaultMiddleware = 1`).
2. Inserted a new `ErpMasterEmployee` row for each of the other 12, with
   `isAllowLogin = 1`, `isActive = 1`, `isDeleted = 0`, `defaultMiddleware = 3`
   (Task Scheduler), `userId` = their `ErpAuthUsers.userId`, `firstName`
   parsed from the username (`-UAT` suffix stripped).
3. Updated `Chithira-UAT`'s existing row: `defaultMiddleware` 1 → 3.
4. Backfilled `lastName = 'UAT'` on all 13 rows for consistency (matching the
   pre-existing `Chithira-UAT` row's shape).

All 13 UAT accounts now have a full `ErpMasterEmployee` row with
`defaultMiddleware = 3`. `departmentId` was left `NULL` on all of them — not
known, and not reliable to assume for real employee rows either (see §3).

## 5. What's still open

- **Login doesn't check `isAllowLogin`.** Today only `ErpAuthUsers.isActive`/
  `isDeleted` gate login. An employee with `isAllowLogin = 0` in
  `ErpMasterEmployee` can still log into Scheduler as long as their
  `ErpAuthUsers` row is active. If ERP-wide login intent should govern
  Scheduler too, `validateErpLogin` needs a `LEFT JOIN ErpMasterEmployee`
  and a check on `isAllowLogin`.
- **`defaultMiddleware` isn't read anywhere in Scheduler.** If the
  middleware portal is going to be the single entry point (see repo memory
  `project_middleware_integration`), the actual handoff mechanism — token
  format, whether Scheduler validates `defaultMiddleware = 3` itself or
  trusts the portal to only route eligible users here — is still TBD by the
  middleware team. Don't assume a design here; confirm with them before
  wiring anything.
- **`departmentId` is unreliable.** Don't reintroduce department-scoped
  query filters based on it (this was already intentionally removed from
  `dashboard.service.ts` during the bigint re-key — see `TESTING_PROGRESS.md`
  / `e9327c2`).

## 6. Test queries

Connection (from `backend/.env`, `DATABASE_URL` — dev only, never point
these at `LIVE_DATABASE_URL`):

```bash
sqlcmd -S <host>,1433 -U <user> -P '<password>' -d ERP-Dev -C -Q "<query>" -W -s "|"
```

**Inspect `ErpMasterEmployee` columns:**
```sql
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'ErpMasterEmployee'
ORDER BY ORDINAL_POSITION;
```

**Check a set of users' employee/middleware linkage:**
```sql
SELECT au.userId, au.userName, me.employeeId, me.firstName, me.lastName,
       me.isAllowLogin, me.isActive, me.departmentId, me.defaultMiddleware
FROM ErpAuthUsers au
LEFT JOIN ErpMasterEmployee me ON me.userId = au.userId
WHERE au.userName LIKE '%-UAT'
ORDER BY au.userName;
```

**List middleware ids:**
```sql
SELECT id, code, name, isActive FROM Middlewares;
```

**Full login-eligibility check for one user (mirrors `validateErpLogin` +
the still-missing employee gate):**
```sql
SELECT TOP 1 u.userId, u.userName, r.roleName,
       me.isAllowLogin, me.defaultMiddleware
FROM ErpAuthUsers u
JOIN ErpAuthUserRoleMap m ON m.userId = u.userId AND m.isActive = 1
JOIN ErpMasterRole r ON r.roleId = m.roleId AND r.isActive = 1 AND r.isDeleted = 0
LEFT JOIN ErpMasterEmployee me ON me.userId = u.userId
WHERE u.userName = 'Chithira-UAT' AND u.isActive = 1 AND u.isDeleted = 0
ORDER BY m.mapId DESC;
```

**Employee `employeeId` is IDENTITY** — confirmed via:
```sql
SELECT c.name, c.is_identity
FROM sys.columns c
WHERE c.object_id = OBJECT_ID('ErpMasterEmployee') AND c.name = 'employeeId';
```
