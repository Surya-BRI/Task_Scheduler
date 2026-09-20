# Integrating a Project with ERP Auth & the Middleware Portal

Generalized reference for **any** project that authenticates against the
shared ERP system and needs to work with the middleware portal (the
company's separate-domain hub that routes a logged-in ERP user into the
right downstream app). This doc is not tied to any one project — it
describes the tables, the expected flow, and what the middleware expects
from an integrating app. For a specific project's implementation notes and
gaps, see that project's own docs (e.g. Task Scheduler's
`backend/docs/ERP_AUTH_MIDDLEWARE.md`).

## 1. The shared ERP tables

These live in the ERP database (not owned by any downstream project — treat
as read-only unless you know otherwise).

### `ErpAuthUsers` — login identity
| Column | Notes |
|---|---|
| `userId` (bigint, PK) | the identity every downstream table should key on |
| `userName` | login username |
| `password` | bcrypt hash |
| `isActive`, `isDeleted` | must both pass for a valid login |

### `ErpAuthUserRoleMap` — user → role
| Column | Notes |
|---|---|
| `userId` | → `ErpAuthUsers.userId` |
| `roleId` | → `ErpMasterRole.roleId` |
| `isActive` | only active mappings count |
| `mapId` | if a user has multiple active mappings, take the latest (`ORDER BY mapId DESC`) |

### `ErpMasterRole` — role catalog
| Column | Notes |
|---|---|
| `roleId` | PK |
| `roleName` | ERP has dozens of granular roles — each integrating project maintains its **own** mapping from `roleName` to its internal role enum; unmapped roles should be treated as "no access" for that project |
| `isActive`, `isDeleted` | must both pass |

### `ErpMasterEmployee` — employee/login-eligibility record
| Column | Notes |
|---|---|
| `employeeId` (bigint, IDENTITY PK) | don't supply on INSERT |
| `firstName`, `lastName` | display name |
| `isAllowLogin` (bit) | **separate** login gate from `ErpAuthUsers.isActive` — an ERP-level "should this person be able to log in anywhere" flag |
| `isActive`, `isDeleted` | employee-record-level active flag |
| `userId` | → `ErpAuthUsers.userId` |
| `departmentId` (bigint, nullable) | **frequently NULL** even for active, login-enabled employees — don't build access-control logic that assumes it's populated |
| `defaultMiddleware` (bigint) | → `Middlewares.id` — see below |

### `Middlewares` — app/destination catalog
| Column | Notes |
|---|---|
| `id` (bigint, PK) | the value an integrating project checks against |
| `code`, `name` | e.g. `ERP`, `Analytics`, `Task Scheduler` |
| `isActive` | |

This is the small lookup table that tells the middleware portal (and
potentially each downstream app) which app a given employee's `userId`
should default into.

## 2. What the middleware expects from an integrating project

1. **Register a `Middlewares` row** (or get one assigned) for your app — you
   need a stable `id` to check against.
2. **Don't re-implement your own user store.** Validate logins directly
   against `ErpAuthUsers` + `ErpAuthUserRoleMap` + `ErpMasterRole` — no local
   shadow accounts, no locally-owned password hashes. The ERP `userId`
   (bigint) is the identity your app's own tables should FK to.
3. **Maintain your own role-mapping table/constant** from `ErpMasterRole.roleName`
   to whatever role concept your app uses. ERP's roles are far more granular
   than any one downstream app needs — this mapping is app-specific and
   lives in your codebase, not in ERP.
4. **Decide how strictly you honor `ErpMasterEmployee.isAllowLogin` and
   `defaultMiddleware`.** At minimum, the middleware portal itself should
   only forward a user to your app if their `defaultMiddleware` matches your
   app's `Middlewares.id` (or your app is otherwise an allowed destination
   for them). Whether your app *also* re-checks `isAllowLogin`/
   `defaultMiddleware` itself (defense in depth) vs. trusting the portal's
   handoff token is a decision to make explicitly with the middleware team —
   don't assume either way.
5. **Don't rely on `departmentId`** from `ErpMasterEmployee` for
   access-scoping decisions; it's inconsistently populated across employees.

## 3. Generic login flow

```
1. User submits { username, password } to your app (or arrives via a
   middleware-portal handoff token — mechanism TBD per integration).
2. Your app queries:
     SELECT TOP 1 u.userId, u.userName, u.password, r.roleName
     FROM ErpAuthUsers u
     JOIN ErpAuthUserRoleMap m ON m.userId = u.userId AND m.isActive = 1
     JOIN ErpMasterRole r ON r.roleId = m.roleId AND r.isActive = 1 AND r.isDeleted = 0
     WHERE u.userName = @userName AND u.isActive = 1 AND u.isDeleted = 0
     ORDER BY m.mapId DESC
3. bcrypt-compare the submitted password against the returned hash.
4. Map r.roleName to your app's internal role via your own lookup table.
   No mapping → treat as unauthorized for this app.
5. (Optional / recommended if not fully trusting the portal handoff)
   LEFT JOIN ErpMasterEmployee on userId and check isAllowLogin = 1 and,
   if you want to enforce destination routing yourself, defaultMiddleware
   matches your app's Middlewares.id.
6. Issue your own session/JWT keyed on the ERP userId — never mint a new
   local identity for it.
```

## 4. Generic test queries

Run against the ERP dev database via `sqlcmd` (or any SQL client) — swap in
your own connection details.

**Schema check for `ErpMasterEmployee`:**
```sql
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'ErpMasterEmployee'
ORDER BY ORDINAL_POSITION;
```

**List available middleware destinations:**
```sql
SELECT id, code, name, isActive FROM Middlewares;
```

**Check a user's full login/middleware eligibility:**
```sql
SELECT TOP 1 u.userId, u.userName, r.roleName,
       me.isAllowLogin, me.isActive AS employeeIsActive,
       me.departmentId, me.defaultMiddleware
FROM ErpAuthUsers u
JOIN ErpAuthUserRoleMap m ON m.userId = u.userId AND m.isActive = 1
JOIN ErpMasterRole r ON r.roleId = m.roleId AND r.isActive = 1 AND r.isDeleted = 0
LEFT JOIN ErpMasterEmployee me ON me.userId = u.userId
WHERE u.userName = @userName AND u.isActive = 1 AND u.isDeleted = 0
ORDER BY m.mapId DESC;
```

**Find users whose `defaultMiddleware` points at your app** (replace `@middlewareId`
with your app's `Middlewares.id`):
```sql
SELECT au.userId, au.userName, me.employeeId, me.firstName, me.lastName
FROM ErpAuthUsers au
JOIN ErpMasterEmployee me ON me.userId = au.userId
WHERE me.defaultMiddleware = @middlewareId
ORDER BY au.userName;
```

**Confirm `employeeId` is IDENTITY before writing INSERTs** (varies by
environment — always check, don't assume):
```sql
SELECT c.name, c.is_identity
FROM sys.columns c
WHERE c.object_id = OBJECT_ID('ErpMasterEmployee') AND c.name = 'employeeId';
```

## 5. Open questions for any new integration

These aren't answered by the tables alone — confirm with the middleware team
per project:
- Exact handoff mechanism from the portal to your app (signed token? shared
  cookie domain? redirect with a short-lived code?).
- Whether your app re-validates `isAllowLogin`/`defaultMiddleware` itself or
  fully trusts the portal's decision to route the user to you.
- Who is responsible for keeping `ErpMasterEmployee` rows (especially
  `defaultMiddleware`) up to date for your app's users — ERP admins, your
  team, or a sync job.
