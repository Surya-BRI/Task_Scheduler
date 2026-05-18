# Repo Reference (Task Scheduler)

## 1) Overview
- Monorepo with 2 workspaces:
- `backend` = NestJS API + Prisma + SQL Server
- `frontend` = Next.js App Router UI
- Root scripts orchestrate both apps (`npm run dev`, `build`, `lint`, `typecheck`).

## 2) Current Top-Level Structure
- `backend/` API modules, Prisma schema/seed, auth, guards, DTOs.
- `frontend/` App Router pages, feature modules, API client, UI components.
- `README.md` setup at repo level.
- `backend/docs/DEVELOPMENT.md` backend runbook.
- `frontend/docs/DEVELOPMENT.md` frontend runbook.

## 3) Backend Reference

### 3.1 Runtime and Boot
- Entry: `backend/src/main.ts`
- Global prefix from config: `api/v1` (default)
- Middleware/features enabled globally:
- `helmet`
- `compression`
- CORS (from `CORS_ORIGIN`, comma-separated)
- `ValidationPipe` with `transform`, `whitelist`, `forbidNonWhitelisted`
- Global filter: `HttpExceptionFilter`
- Global interceptor: `LoggingInterceptor`

### 3.2 Modules Loaded in AppModule
`backend/src/app.module.ts` currently imports:
- `PrismaModule`
- `HealthModule`
- `AuthModule`
- `UsersModule`
- `DepartmentsModule`
- `ProjectsModule`
- `TasksModule`
- `DesignListModule`
- `RegularizationRequestsModule`
- `OvertimeRequestsModule`
- `SchedulerAssignmentsModule`
- `ChatterPostsModule`

### 3.3 API Surface (Controller Map)
All routes are under `/api/v1/*` via global prefix.

- `GET /health`
- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`

- `POST /users`
- `GET /users`
- `GET /users/:id`
- `PATCH /users/:id`
- `DELETE /users/:id`

- `POST /departments`
- `GET /departments`
- `GET /departments/:id`
- `PATCH /departments/:id`
- `DELETE /departments/:id`

- `POST /projects`
- `GET /projects`
- `GET /projects/by-project-no/:projectNo`
- `GET /projects/:id`
- `POST /projects/:id/files`
- `GET /projects/:id/files`
- `DELETE /projects/:id/files/:fileId`
- `PATCH /projects/:id`
- `DELETE /projects/:id`

- `POST /tasks`
- `POST /tasks/extended`
- `POST /tasks/upload-file`
- `GET /tasks`
- `GET /tasks/summary`
- `GET /tasks/:id`
- `PATCH /tasks/:id`
- `PATCH /tasks/:id/assign`
- `PATCH /tasks/:id/status`
- `DELETE /tasks/:id`

- `GET /design-list`
- `GET /design-list/projects-list`
- `GET /regularization-requests`
- `POST /regularization-requests`
- `PATCH /regularization-requests/:id`
- `GET /overtime-requests`
- `POST /overtime-requests`
- `PATCH /overtime-requests/:id`
- `GET /scheduler-assignments`
- `GET /activities`
- `GET /activities/task/:taskId`
- `GET /activities/project/:projectId`
- `GET /chatter-posts`
- `GET /chatter-posts?projectId=:projectId`
- `POST /chatter-posts`
- `POST /chatter-posts/:postId/comments`

### 3.4 Auth and Roles
- JWT auth is implemented with Nest guards/strategy.
- Role checks use:
- `Roles` decorator
- `RolesGuard`
- Role enum in `backend/src/common/constants/roles.enum.ts`
- `AuthService.login`:
- looks up user by email
- compares bcrypt hash
- returns `accessToken` + user payload

### 3.6 Activity Timeline and Logging
- Activity timeline is backed by `ErpTSActivityLog` (`ActivityLog` model).
- New scoped endpoints support Activity tab UX:
- `/activities/task/:taskId` (default mode)
- `/activities/project/:projectId` (project-wide toggle mode)
- Logging for current rollout includes:
- `TASK_CREATED`
- `ASSIGNED_TASK`
- `STATUS_CHANGED`
- `TASK_FILE_UPLOADED`
- `PROJECT_FILE_UPLOADED`
- `PROJECT_FILE_DELETED`
- `CREATED_CHATTER_POST`
- `CREATED_CHATTER_COMMENT`
- Coverage document:
- `backend/docs/ACTIVITY_LOG_COVERAGE.md`

### 3.5 Config and Env
- Config source: `backend/src/config/configuration.ts`
- Validation: `backend/src/config/env.validation.ts` (Joi)
- Env file resolution: `backend/src/config/resolve-env-file.ts`
- Loads whichever exists first:
- `<repo>/backend/.env` (when running in backend dir)
- `<repo>/.env` (when running from root)

Required/high-impact vars:
- `JWT_ACCESS_SECRET`
- `CORS_ORIGIN`
- DB via `DATABASE_URL` OR DB parts (`DB_SERVER`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, etc.)
- `PORT`, `API_PREFIX`

## 4) Prisma in This Repo (Important)

### 4.1 Source of Truth
- Prisma schema file: `backend/prisma/schema.prisma`
- Current core models include:
- `Role`
- `Department`
- `User` (includes optional `departmentId` relation)
- `Project` (includes `projectNo`, `category`, `businessUnit`, `status`, `salesPerson`)
- `Task` (includes `opNo`, `priority`, `startedAt`, `completedAt`)

### 4.2 Client Generation Flow
When schema changes, run:
- `npm run prisma:generate --workspace backend`

This regenerates `@prisma/client` types and APIs. If not regenerated, TypeScript errors appear like:
- `Property 'department' does not exist on type 'PrismaService'`
- field-not-found errors for `projectNo`, `opNo`, `priority`, etc.

### 4.3 Runtime DB URL Used by PrismaService
- File: `backend/src/prisma/prisma.service.ts`
- PrismaService now uses app DB config (`database.url` / `DATABASE_URL`) for the main Prisma client.
- `LIVE_DATABASE_URL` is for ERP read-only integration scenarios and should not override core Prisma app models.

### 4.4 Migrations and Seeding
Backend scripts:
- `npm run prisma:migrate --workspace backend`
- `npm run prisma:seed --workspace backend`

Seed file: `backend/prisma/seed.ts`
- upserts roles (`HOD`, `DESIGNER`)
- upserts demo users with bcrypt passwords

### 4.5 Common Prisma Troubleshooting
- After changing schema: run `prisma generate` and restart backend watcher.
- If 500s appear on model relations/fields, verify app is connected to the intended database/schema.
- If login fails due to passwords, ensure SQL-stored password hashes are bcrypt values.

## 5) Frontend Reference

### 5.1 Runtime and Env
- Next.js app on port `5000` by default.
- API base URL from `NEXT_PUBLIC_API_BASE_URL`.
- In this repo, `frontend/.env` currently points to `http://localhost:7000/api/v1`.
- This must match backend `PORT` + prefix.

### 5.2 API Client Behavior
- `frontend/src/lib/api-client.ts`
- Builds request URL as `${env.apiBaseUrl}${path}`
- Adds `Authorization: Bearer <token>` if present
- On `401`, clears token and throws `Unauthorized`
- On non-2xx, throws error with response text body

### 5.3 Major UI Areas
- App Router under `frontend/src/app`
- Dashboard routes under `(dashboard)`
- Auth routes under `(auth)`
- Feature-heavy modules:
- design list
- design scheduler
- designer dashboard
- chatter
- team activity

### 5.4 Detail Page Timeline/Chatter Wiring
- Activity tab in detail pages supports:
- Task mode: `/activities/task/:taskId`
- Project mode: `/activities/project/:projectId`
- Chatter tab in detail pages is backend-driven and project-scoped by default:
- `/chatter-posts?projectId=<projectUuid>`
- Chatter cards now render author name/role from API fields:
- `authorName`
- `authorRole`
- Sidebar panels in detail pages are live now:
- Project History uses project activity feed
- Field History uses filtered project activity (`TASK_CREATED`, `ASSIGNED_TASK`, `STATUS_CHANGED`)

## 6) Root Scripts
From repository root:
- `npm run dev` = backend + frontend together
- `npm run dev:backend`
- `npm run dev:frontend`
- `npm run prisma:generate`
- `npm run prisma:migrate`
- `npm run prisma:seed`
- `npm run build`
- `npm run lint`
- `npm run typecheck`

## 7) Known Integration Risks
- Frontend and backend port mismatch causes fetch failures.
- Prisma schema and generated client drift causes TypeScript compile failures.
- Using wrong DB URL (for example a different ERP schema) causes runtime 500s on auth/data queries.
- Some frontend screens still rely on mixed mock/live flows, so behavior can vary by route.

## 8) Suggested Team Workflow
1. Change Prisma schema.
2. Run `prisma generate`.
3. Run migration/SQL updates if needed.
4. Restart backend dev server.
5. Run `npm run build --workspace backend`.
6. Validate endpoint manually (for example `/api/v1/health`, then feature-specific endpoints).
