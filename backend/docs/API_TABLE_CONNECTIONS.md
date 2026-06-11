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

Prisma schema models (and mapped SQL tables) in `backend/prisma/schema.prisma`: **33**

**Core**
1. `Role` → `ErpTSRole`
2. `Department` → `Department`
3. `User` → `ErpTSUser`
4. `Project` → `ErpTSProject`
5. `Task` → `ErpTSTask`
6. `DesignTask` → `ErpTSDesignTask`
7. `SignageDetail` → `ErpTSSignageDetail`

**Task Details & Attachments**
8. `RetailTaskDetail` → `ErpTSRetailTaskDetail`
9. `ProjectTaskDetail` → `ErpTSProjectTaskDetail`
10. `ProjectSignRow` → `ErpTSProjectSignRow`
11. `ProjectAttachment` → `ErpTSProjectAttachment`
12. `RetailTaskDetailAttachment` → `ErpTSRetailTaskDetailAttachment`
13. `ProjectTaskDetailAttachment` → `ErpTSProjectTaskDetailAttachment`

**Chatter & Communications**
14. `ChatterPost` → `ErpTSChatterPost`
15. `ChatterComment` → `ErpTSChatterComment`
16. `Attachment` → `ErpTSChatterPostAttachment`
17. `LinkAttachment` → `ErpTSLinkAttachment`
18. `Conversation` → `ErpTSConversation`
19. `ConversationParticipant` → `ErpTSConversationParticipant`
20. `Message` → `ErpTSMessage`

**Requests & Approvals**
21. `LeaveRequest` → `ErpTSLeaveRequest`
22. `RegularizationRequest` → `ErpTSRegularizationRequest`
23. `OvertimeRequest` → `ErpTSOvertimeRequest`
24. `OvertimeApprovalHistory` → `ErpTSOvertimeApprovalHistory`
25. `OvertimeAttachment` → `ErpTSOvertimeAttachment`

**Scheduler**
26. `SchedulerAssignment` → `ErpTSSchedulerAssignment`
27. `SchedulerWeek` → `ErpTSSchedulerWeek`
28. `SchedulerAssignmentHistory` → `ErpTSSchedulerAssignmentHistory`

**Activity, Notifications & Inbox**
29. `ActivityLog` → `ErpTSActivityLog`
30. `Notification` → `ErpTSNotification`
31. `InboxReadMarker` → `ErpTSInboxRead`

**Task Work Sessions**
32. `TaskWorkSession` → `ErpTSTaskWorkSession`
33. `TaskWorkSessionFile` → `ErpTSTaskWorkSessionFile`

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
- Connected tables: `ErpTSTask`, `ErpTSUser`, `ErpTSProject`, `ErpTSActivityLog`, `ErpTSRetailTaskDetail`, `ErpTSProjectTaskDetail`, `ErpTSRetailTaskDetailAttachment`, `ErpTSProjectTaskDetailAttachment`, `ErpTSTaskWorkSession`, `ErpTSTaskWorkSessionFile`
- Extended create endpoint: `POST /tasks/extended` creates parent `ErpTSTask` and type-specific details in a single transaction.
- Extended create contract now requires `task.projectName` (no fallback naming); missing value returns `400`.
- File endpoint: `POST /tasks/upload-file` uploads to S3 and logs activity.
- Timer state endpoints: `GET /tasks/:id/timer-state` and `POST /tasks/:id/save-timer` upsert a Draft `ErpTSTaskWorkSession` for cold-start restore.
- Work submission endpoint: `POST /tasks/:id/submit-work` promotes session to Submitted status, uploads files to S3 into `ErpTSTaskWorkSessionFile`, and logs `TASK_WORK_SUBMITTED` activity.

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
- Key endpoints:
  - `GET /requests` — own requests
  - `GET /requests/pending-approvals` — HOD approval queue
  - `GET /requests/team-requests` — HOD team view
  - `POST /requests/:id/cancel` — cancel (Designer)
  - `POST /requests/:id/review` — approve/reject (HOD)
  - `POST /requests/:id/revoke` — revoke approved (HOD)

### `regularization-requests`
- Controller: `backend/src/regularization-requests/regularization-requests.controller.ts`
- Service: `backend/src/regularization-requests/regularization-requests.service.ts`
- Connected table: `ErpTSRegularizationRequest` (raw SQL via Prisma)
- Key endpoints:
  - `GET /regularization-requests/task-options` — tasks for selection
  - `GET /regularization-requests/pending-approvals` — HOD queue
  - `GET /regularization-requests/team-requests` — HOD team view
  - `POST /regularization-requests/:id/review` — HOD review

### `overtime-requests`
- Controller: `backend/src/overtime-requests/overtime-requests.controller.ts`
- Service: `backend/src/overtime-requests/overtime-requests.service.ts`
- Connected tables: `ErpTSOvertimeRequest`, `ErpTSOvertimeApprovalHistory`, `ErpTSOvertimeAttachment`
- Key endpoints:
  - `GET /overtime-requests/my-requests` — own requests with filters
  - `GET /overtime-requests/pending-approvals` — HOD queue
  - `GET /overtime-requests/team-requests` — HOD team view
  - `GET /overtime-requests/all` — HOD paginated all
  - `GET /overtime-requests/statistics` — HOD stats
  - `GET /overtime-requests/export` — HOD export
  - `POST /overtime-requests/:id/submit` — submit
  - `POST /overtime-requests/:id/withdraw` — withdraw
  - `POST /overtime-requests/:id/attachment` — upload file
  - `POST /overtime-requests/:id/review` — HOD review

### `scheduler-assignments`
- Controller: `backend/src/scheduler-assignments/scheduler-assignments.controller.ts`
- Service: `backend/src/scheduler-assignments/scheduler-assignments.service.ts`
- Connected tables: `ErpTSSchedulerAssignment`, `ErpTSSchedulerWeek`, `ErpTSSchedulerAssignmentHistory`

### `design-list`
- Controller: `backend/src/design-list/design-list.controller.ts`
- Service: `backend/src/design-list/design-list.service.ts`
- Connected table source: ERP SQL views/tables queried through `prisma.live.$queryRaw...` (read-only reporting style)

### `dashboard`
- Controller: `backend/src/dashboard/dashboard.controller.ts`
- Service: `backend/src/dashboard/dashboard.service.ts`
- DTO: `backend/src/dashboard/projects-overview.dto.ts`
- Connected tables: `ErpTSTask`, `ErpTSProject`, `ErpTSSchedulerAssignment`, `ErpTSActivityLog`, `ErpTSUser`
- Endpoints:
  - `GET /dashboard/metrics` — task/project counts for current user
  - `GET /dashboard/projects-overview?weekStart=YYYY-MM-DD` — weekly snapshot: scheduled tasks, completed, on-hold, reallocated, inbox feed, donut summary

### `notifications`
- Controller: `backend/src/notifications/notifications.controller.ts`
- Service: `backend/src/notifications/notifications.service.ts`
- Connected table: `ErpTSNotification`
- Endpoints:
  - `GET /notifications` — user's notifications (query: `limit`)
  - `GET /notifications/unread-count` — unread count
  - `PATCH /notifications/:id/read` — mark read
  - `PATCH /notifications/:id/unread` — mark unread
  - `POST /notifications/read-all` — mark all read

### `chat` (Conversations)
- Controller: `backend/src/chat/chat.controller.ts`
- Service: `backend/src/chat/chat.service.ts`
- Gateway: `backend/src/chat/chat.gateway.ts` (WebSocket, room: `conv:{conversationId}`)
- Connected tables: `ErpTSConversation`, `ErpTSConversationParticipant`, `ErpTSMessage`
- Endpoints:
  - `POST /conversations` — create or retrieve existing DM
  - `GET /conversations` — list user's conversations
  - `GET /conversations/:id/messages` — paginated history (query: `limit`, `before`)
  - `POST /conversations/:id/messages` — send message (broadcasts `message` WS event)
  - `POST /conversations/:id/read` — mark read (broadcasts `messageRead` WS event)
  - `DELETE /conversations/:id` — delete / leave

### `health`
- Controller: `backend/src/health/health.controller.ts`
- Connected tables: none (health endpoint)
