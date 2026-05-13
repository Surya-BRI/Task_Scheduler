# Repo Reference (AI)

## 1) Repository Overview
- Monorepo name: `task-scheduler`
- Workspaces:
  - `backend` (NestJS + Prisma + MSSQL)
  - `frontend` (Next.js App Router)
- Root scripts orchestrate both apps.
- Runtime split:
  - Backend API default: `http://localhost:4000/api/v1`
  - Frontend default: `http://localhost:5000`

## 2) Top-Level Structure
- `backend/`: API, auth, DB schema/seed, guards, DTO validation.
- `frontend/`: app routes, feature UIs, mock-auth flows, API client utilities.
- `README.md`: monorepo setup and runbook.
- `package.json`: workspace scripts (`dev:backend`, `dev:frontend`, `build`, `lint`, `typecheck`).

## 3) Backend Reference (`backend/`)

### 3.1 Tech + Bootstrapping
- Framework: NestJS 11.
- ORM: Prisma (`sqlserver` provider).
- Entry point: `backend/src/main.ts`.
- Global setup in `main.ts`:
  - Prefix from config (`api/v1` default).
  - `helmet`, `compression`, CORS (`CORS_ORIGIN`, comma-separated allowed).
  - Global `ValidationPipe` (`transform`, `whitelist`, `forbidNonWhitelisted`).
  - Global exception filter and logging interceptor.

### 3.2 Module Graph
- Root module: `backend/src/app.module.ts`
- Imported modules:
  - `PrismaModule`
  - `HealthModule`
  - `AuthModule`
  - `UsersModule`
  - `ProjectsModule`
  - `TasksModule`

### 3.3 Config + Env
- Config factory: `backend/src/config/configuration.ts`
  - Supports `DATABASE_URL` or builds it from DB parts (`DB_SERVER`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, etc).
- Validation schema: `backend/src/config/env.validation.ts` (Joi)
  - Requires `JWT_ACCESS_SECRET` (min 16 chars).
  - Requires `CORS_ORIGIN` (valid URI list).
  - Requires either full `DATABASE_URL` or DB-part set.

### 3.4 Data Model (Prisma)
File: `backend/prisma/schema.prisma`
- `Role`: unique role name (`HOD`, `DESIGNER`).
- `User`: email, password hash, role, tasks, created projects.
- `Project`: name/description, active flag, creator link, tasks.
- `Task`: title/description, status string (`PENDING` default), project, optional assignee, due date.

### 3.5 Seed + DB Utilities
- Seed file: `backend/prisma/seed.ts`
  - Upserts roles `HOD` and `DESIGNER`.
  - Upserts users:
    - `hod@company.com` / `Secret123!`
    - `designer@company.com` / `Secret123!`
- SQL helper: `backend/prisma/fix-passwords-for-login.sql`.
- Bcrypt helper: `backend/scripts/gen-bcrypt.js`.

### 3.6 Auth + Authorization
- Auth routes: `backend/src/auth/auth.controller.ts`
  - `POST /auth/register`
  - `POST /auth/login`
- Auth service: `backend/src/auth/auth.service.ts`
  - Login compares bcrypt hash.
  - JWT payload: `{ sub, email, role }`.
- JWT strategy: `backend/src/auth/jwt.strategy.ts`.
- RBAC:
  - Roles enum: `backend/src/common/constants/roles.enum.ts`
  - Roles decorator: `backend/src/common/decorators/roles.decorator.ts`
  - Roles guard: `backend/src/common/guards/roles.guard.ts`
  - JWT guard: `backend/src/common/guards/jwt-auth.guard.ts`
  - Current user decorator: `backend/src/common/decorators/current-user.decorator.ts`

### 3.7 Backend API Surface
All routes are effectively under `/api/v1` by default.

- Health:
  - `GET /health` -> status/timestamp/uptime

- Users (JWT + role guarded):
  - `POST /users` (HOD only)
  - `GET /users` (HOD only)

- Projects:
  - `POST /projects` (HOD only)
  - `GET /projects` (HOD + DESIGNER)
  - `PATCH /projects/:id` (HOD only)

- Tasks:
  - `POST /tasks` (HOD only)
  - `GET /tasks?page=1&limit=20` (HOD gets all, DESIGNER gets own assigned)
  - `PATCH /tasks/:id` (HOD only)
  - `PATCH /tasks/:id/assign` (HOD only)
  - `PATCH /tasks/:id/status` (HOD + assigned DESIGNER)

### 3.8 DTO Validation Rules
- Login/Register/User DTOs enforce email + password min length + enum role.
- Project DTOs enforce name min length and optional description/active flag.
- Task DTOs enforce title min length, UUID project/assignee IDs, ISO date strings, status enum (`PENDING`, `WIP`, `COMPLETED`).

### 3.9 Backend Notables
- Exception filter wraps all errors into `{ statusCode, message, timestamp, path }`.
- Logging interceptor logs method/path/latency.
- Prisma service connects on module init.

## 4) Frontend Reference (`frontend/`)

### 4.1 Tech + Runtime
- Next.js `16.2.3`, React `19.2.4`.
- App Router with grouped segments:
  - `(auth)`
  - `(dashboard)`
  - plus feature routes outside groups.
- Root layout: `frontend/src/app/layout.jsx`.

### 4.2 Core Client Utilities
- API base/env: `frontend/src/lib/env.ts`
- Access token storage: `frontend/src/lib/auth-token.ts`
- Fetch wrapper: `frontend/src/lib/api-client.ts`
  - Adds `Authorization` if token exists.
  - On `401` clears token and throws error.
- Auth API: `frontend/src/features/auth/services/auth.api.js` (calls `/auth/login`).

### 4.3 Actual Auth Mode in Current UI
Current login form (`frontend/src/features/auth/components/login-form.jsx`) uses `mock-auth` local flow, not backend login by default.
- Local session helper: `frontend/src/lib/mock-auth.js`
  - Stores session in localStorage key `br_session`.
  - Role-based home route:
    - HOD -> `/design-list`
    - DESIGNER -> `/design-list/my-work`

### 4.4 Route Map (Pages)
From `frontend/src/app/**/page.jsx`:
- `/` -> redirects to `/login`
- `/login` (grouped under `(auth)`)
- Dashboard starter pages under `(dashboard)`:
  - `/dashboard`
  - `/projects`
  - `/tasks`
  - `/settings`
- Additional feature routes:
  - `/design-list`
  - `/design-list/my-work`
  - `/design-list/record/[taskId]`
  - `/design-list/task/[taskId]`
  - `/design-scheduler`
  - `/projects-overview`
  - `/projects-list`
  - `/project-design`
  - `/retail/[projectRowId]`
  - `/designer/[designerId]`
  - `/designer/[designerId]/team-activity`
  - `/designer/[designerId]/leave-planner`
  - `/designer/[designerId]/requests`
  - `/team-activity`
  - `/chatter`
  - `/alex-login`

### 4.5 Important Feature Areas
- Global provider:
  - `frontend/src/components/DesignProviders.jsx`
  - `frontend/src/state/DesignListContext.jsx`
  - Stores and filters design records in-memory from `src/data/designs.js`.

- Scheduler:
  - Route: `/design-scheduler`
  - Main component: `frontend/src/features/scheduler/components/DesignSchedulerScreen.jsx`
  - Heavy drag/drop + split-task + overtime logic; uses local state and sync helpers.

- Designer dashboard:
  - Route: `/designer/[designerId]`
  - Files: `frontend/src/app/designer/[designerId]/page.jsx`, `DesignerDashboard.jsx`
  - Pulls JSON from `src/data/designers/*.json`, with fallback mock generation for IDs.

- Projects overview and project views:
  - `frontend/src/features/projects/components/ProjectsOverviewScreen.jsx`
  - `frontend/src/views/RetailProjectPage.jsx`

- Chatter and team activity:
  - `frontend/src/features/chatter/components/ChatterScreen.jsx`
  - `frontend/src/features/team-activity/components/*`

### 4.6 Backend-Connected Services (typed APIs)
- Projects API: `frontend/src/features/projects/services/projects.api.ts`
- Tasks API: `frontend/src/features/tasks/services/tasks.api.ts`
- Hooks:
  - `frontend/src/hooks/use-projects.ts`
  - `frontend/src/hooks/use-tasks.ts`

### 4.7 UI Layout System
- New dashboard shell:
  - `frontend/src/components/layout/sidebar.jsx`
  - `frontend/src/components/layout/topbar.jsx`
  - `frontend/src/components/layout/page-container.jsx`
- Primary app shell/navbar for design modules:
  - `frontend/src/components/Navbar.jsx`

## 5) Cross-Cutting Notes for AI Contributors
- There are two parallel UX tracks:
  - Starter CRUD dashboard (`/dashboard`, `/projects`, `/tasks`) mostly placeholder tables.
  - Rich design workflow routes (`/design-list`, `/design-scheduler`, `/designer/*`) with significant mock/local-state behavior.
- Auth is currently mixed:
  - Backend JWT APIs exist.
  - Active login page currently uses local mock session (`mock-auth`) unless changed.
- API client exists and is ready for real backend wiring, but some flows bypass it.
- Data models differ between backend Task/Project entities and rich frontend design/scheduler records.
- Database table creation rule (from now on):
  - New mandatory naming convention: any new table created from this codebase must use `ErpS...` prefix (insert `S` immediately after `Erp`).
    - Example: `ErpDesignTask` -> `ErpSDesignTask` for new scheduler-owned tables.
  - This applies to new table creation only; do not rename existing legacy `Erp...` tables unless explicitly requested.
  - Before creating any new table, check whether a similarly named table already exists.
  - If a similar name exists and it is not an intentional extension of that table, create a non-conflicting table name using an `ErpSdlr...` prefix/suffix pattern.
  - Do not rename or alter legacy/existing tables unless explicitly requested.

## 6) Quick File Index (High-Value)
- Root:
  - `README.md`
  - `package.json`
- Backend:
  - `backend/src/main.ts`
  - `backend/src/app.module.ts`
  - `backend/src/config/configuration.ts`
  - `backend/src/config/env.validation.ts`
  - `backend/prisma/schema.prisma`
  - `backend/prisma/seed.ts`
  - `backend/src/auth/*`
  - `backend/src/users/*`
  - `backend/src/projects/*`
  - `backend/src/tasks/*`
  - `backend/src/common/*`
- Frontend:
  - `frontend/src/app/layout.jsx`
  - `frontend/src/app/page.jsx`
  - `frontend/src/lib/mock-auth.js`
  - `frontend/src/lib/api-client.ts`
  - `frontend/src/state/DesignListContext.jsx`
  - `frontend/src/features/design-list/components/DesignListScreen.jsx`
  - `frontend/src/features/scheduler/components/DesignSchedulerScreen.jsx`
  - `frontend/src/app/designer/[designerId]/DesignerDashboard.jsx`
  - `frontend/src/components/Navbar.jsx`

## 7) Excluded from Deep Analysis
- `node_modules/` (dependency vendored code, not project-authored source).
- Binary assets in `frontend/public/*` were cataloged but not semantically analyzed.

## 8) Suggested Next AI Tasks
- Unify auth: connect `login-form.jsx` to `auth.api.js` + JWT token storage.
- Add shared API contracts between backend DTO/Prisma types and frontend types.
- Add tests for scheduler split/overtime algorithm and role-based route guards.

## 9) API Rules (Project/Design List) - Team Reference
These rules are mandatory for future AI/dev updates unless explicitly overridden.

- Data source for Project Design list:
  - Use live ERP query (Prisma + SQL Server), not dummy project data.
  - Query ordering must be latest first: `ORDER BY mp.createdOn DESC`.

- Project list endpoint behavior:
  - Use backend pagination for `/design-list/projects-list`.
  - Default page size: `100`.
  - Current limit guard: max `200`.
  - Frontend `/projects-list` must request paged data from backend, not fetch full list then paginate locally.

- Null handling policy (important):
  - If source value is `NULL`, keep it as `null` in API response for projects-list payload.
  - Do not auto-replace `null` with fallback business text like `Unassigned`/`-` for projects-list fields.
  - Frontend may render missing values as literal `"null"` for visibility, but backend should preserve nulls.

- Naming/UI terminology:
  - Show `Project Code` in UI (not `Project ID`) for projects list display/search semantics.

- Design type/category mapping:
  - Derive `designType` from `businessUnitCode` mapping.
  - Unknown/unmapped business units fallback to `Project`.
  - Log unknown BU mapping events for follow-up mapping updates.
