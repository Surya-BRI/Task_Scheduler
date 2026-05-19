# Backend API and Table Connections

This document explains:
- how backend APIs are written in this project
- which database table(s) each API module is connected to

## API Architecture

- Framework: NestJS
- Route layer: `*.controller.ts` files with decorators (`@Controller`, `@Get`, `@Post`, `@Patch`, `@Delete`)
- Business layer: `*.service.ts` files (controller calls service)
- Data layer: `PrismaService` (`backend/src/prisma/prisma.service.ts`) using Prisma Client and some raw SQL for ERP tables
- Prefix: `api/v1` set globally in `backend/src/main.ts`
- Validation: global `ValidationPipe` with DTOs
- Security: `JwtAuthGuard`, `RolesGuard`, and `@Roles(...)`

## Total Connected Tables

Prisma schema models (and mapped SQL tables) in `backend/prisma/schema.prisma`: **19**

1. `Role` -> `ErpTSRole`
2. `Department` -> `Department`
3. `User` -> `ErpTSUser`
4. `Project` -> `ErpTSProject`
5. `Task` -> `ErpTSTask`
6. `DesignTask` -> `ErpTSDesignTask`
7. `SignageDetail` -> `ErpTSSignageDetail`
8. `ChatterPost` -> `ErpTSChatterPost`
9. `ChatterComment` -> `ErpTSChatterComment`
10. `Attachment` -> `ErpTSChatterPostAttachment`
11. `LinkAttachment` -> `ErpTSLinkAttachment`
12. `LeaveRequest` -> `ErpTSLeaveRequest`
13. `RegularizationRequest` -> `ErpTSRegularizationRequest`
14. `OvertimeRequest` -> `ErpTSOvertimeRequest`
15. `SchedulerAssignment` -> `ErpTSSchedulerAssignment`
16. `ActivityLog` -> `ErpTSActivityLog`
17. `Notification` -> `ErpTSNotification`
18. `RetailTaskDetail` -> `ErpTSRetailTaskDetail`
19. `ProjectTaskDetail` -> `ErpTSProjectTaskDetail`

## Module to Table Mapping

### `auth`
- Controller: `backend/src/auth/auth.controller.ts`
- Service: `backend/src/auth/auth.service.ts`
- Connected tables (indirect via `UsersService`): `ErpTSUser`, `ErpTSRole`

### `users`
- Controller: `backend/src/users/users.controller.ts`
- Service: `backend/src/users/users.service.ts`
- Connected tables: `ErpTSUser`, `ErpTSRole`, `Department`

### `departments`
- Controller: `backend/src/departments/departments.controller.ts`
- Service: `backend/src/departments/departments.service.ts`
- Connected table: `Department`

### `projects`
- Controller: `backend/src/projects/projects.controller.ts`
- Service: `backend/src/projects/projects.service.ts`
- Connected tables: `ErpTSProject`, `ErpTSProjectAttachment`, `ErpTSActivityLog`
- Fallback read source for hydration: ERP master project tables via `prisma.live` (`ErpMasterProject` + joins)
- Key endpoints include:
  - `GET /projects/by-project-no/:projectNo`
  - `POST /projects/:id/files`
  - `GET /projects/:id/files`
  - `DELETE /projects/:id/files/:fileId`
- `GET /projects/by-project-no/:projectNo` now hydrates missing app rows into `ErpTSProject` when project exists in ERP master source.

### `tasks`
- Controller: `backend/src/tasks/tasks.controller.ts`
- Service: `backend/src/tasks/tasks.service.ts`
- Connected tables: `ErpTSTask`, `ErpTSUser`, `ErpTSProject`, `ErpTSActivityLog`, `ErpTSRetailTaskDetail`, `ErpTSProjectTaskDetail`, `ErpTSRetailTaskDetailAttachment`, `ErpTSProjectTaskDetailAttachment`
- Extended create endpoint: `POST /tasks/extended` creates parent `ErpTSTask` and type-specific details in a single transaction.
- Extended create contract now requires `task.projectName` (no fallback naming); missing value returns `400`.
- File endpoint: `POST /tasks/upload-file` uploads to S3 and logs activity.

### `activities`
- Controller: `backend/src/activities/activities.controller.ts`
- Service: `backend/src/activities/activities.service.ts`
- Connected table: `ErpTSActivityLog`
- Endpoints:
  - `GET /activities` (team feed compatibility shape)
  - `GET /activities/task/:taskId` (task timeline)
  - `GET /activities/project/:projectId` (project timeline)

### `chatter-posts`
- Controller: `backend/src/chatter-posts/chatter-posts.controller.ts`
- Service: `backend/src/chatter-posts/chatter-posts.service.ts`
- Connected tables: `ErpTSChatterPost`, `ErpTSChatterComment`, `ErpTSActivityLog`, `ErpTSUser`, `ErpTSTask`
- Endpoints:
  - `GET /chatter-posts?taskId=<uuid>&limit=<n>`
  - `GET /chatter-posts?projectId=<uuid>&limit=<n>` (project-wide feed for detail pages)
  - `POST /chatter-posts`
  - `POST /chatter-posts/:postId/comments`

### `requests` (Leave Requests)
- Controller: `backend/src/requests/requests.controller.ts`
- Service: `backend/src/requests/requests.service.ts`
- Connected tables: `ErpTSLeaveRequest`, `ErpTSUser`

### `regularization-requests`
- Controller: `backend/src/regularization-requests/regularization-requests.controller.ts`
- Service: `backend/src/regularization-requests/regularization-requests.service.ts`
- Connected table: `ErpTSRegularizationRequest` (raw SQL via Prisma)

### `overtime-requests`
- Controller: `backend/src/overtime-requests/overtime-requests.controller.ts`
- Service: `backend/src/overtime-requests/overtime-requests.service.ts`
- Connected table: `ErpTSOvertimeRequest` (raw SQL via Prisma)

### `scheduler-assignments`
- Controller: `backend/src/scheduler-assignments/scheduler-assignments.controller.ts`
- Service: `backend/src/scheduler-assignments/scheduler-assignments.service.ts`
- Connected table: `ErpTSSchedulerAssignment` (raw SQL via Prisma)

### `design-list`
- Controller: `backend/src/design-list/design-list.controller.ts`
- Service: `backend/src/design-list/design-list.service.ts`
- Connected table source: ERP SQL views/tables queried through `prisma.live.$queryRaw...` (read-only reporting style)

### `dashboard`
- Controller: `backend/src/dashboard/dashboard.controller.ts`
- Service: `backend/src/dashboard/dashboard.service.ts`
- Connected tables: `ErpTSTask`, `ErpTSProject`

### `health`
- Controller: `backend/src/health/health.controller.ts`
- Connected tables: none (health endpoint)
