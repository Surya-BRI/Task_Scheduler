# Scheduler Monorepo — AI Reference Document

> Complete technical reference for the Task Scheduler ERP integration project.
> Use this document to answer questions about architecture, endpoints, data models, routes, and conventions without reading source files.

---

## 1. Project Overview

**Purpose:** Task and project management system for Blue Rhine Industries (BRI). Manages design tasks, designer workload scheduling, project attachments, team collaboration (chatter), leave/overtime requests, and activity audit trails. Integrates with an existing SQL Server ERP system via ErpTS-prefixed tables.

**Monorepo Structure:**
```
D:\Scheduler\
├── backend/          NestJS API (port 4000 dev / 7000 prod)
├── frontend/         Next.js app (port 5000)
├── package.json      Workspace root — concurrent dev scripts
├── DEPLOYMENT_RUNBOOK.md
└── repo-reference.md (this file)
```

**Tech Stack:**

| Layer | Technology |
|-------|-----------|
| Frontend framework | Next.js 16.2.3 (App Router), React 19.2.4 |
| Frontend styling | Tailwind CSS v4 |
| Frontend forms | React Hook Form 7.72 + Zod 4.3 |
| Frontend tables | TanStack Table 8.21, TanStack Virtual 3.13 |
| Backend framework | NestJS 11.0.1 (Express adapter) |
| Database ORM | Prisma 6.19.3 |
| Database | SQL Server (sqlserver provider) |
| Auth | JWT via Passport.js (@nestjs/jwt, passport-jwt) |
| File storage | AWS S3 (ap-south-1) |
| Validation | class-validator + class-transformer (backend), Zod (frontend) |
| Password hashing | bcrypt |

---

## 2. Backend Architecture

### Module Map

```
AppModule
├── ConfigModule (global)
├── PrismaModule (global singleton)
├── HealthModule
├── AuthModule
├── UsersModule
├── DepartmentsModule
├── ProjectsModule
├── TasksModule
├── DesignListModule
├── RegularizationRequestsModule
├── OvertimeRequestsModule
├── SchedulerAssignmentsModule
├── ChatterPostsModule
├── ActivitiesModule
├── RequestsModule
├── DashboardModule
├── NotificationsModule
└── ChatModule (WebSocket gateway + REST)
```

### Bootstrap (`backend/src/main.ts`)
- Global API prefix: `api/v1` (env: `api.prefix`)
- Port: `4000` dev (env: `app.port`)
- **Middleware (order):** helmet → compression → CORS
- **Global pipes:** `ValidationPipe` (transform: true, whitelist: true, forbidNonWhitelisted: true)
- **Global filters:** `HttpExceptionFilter` — standardized `{statusCode, message, timestamp, path}` responses
- **Global interceptors:** `LoggingInterceptor` — logs `METHOD PATH Xms`
- Creates `uploads/chatter` directory on startup for chatter file storage

### Common (`backend/src/common/`)
| File | Purpose |
|------|---------|
| `guards/jwt-auth.guard.ts` | Validates JWT; dev bypass via `X-Dev-User-Id/Email/Role` headers when `NODE_ENV !== production` |
| `guards/roles.guard.ts` | Checks `@Roles()` metadata against `request.user.role` |
| `decorators/current-user.decorator.ts` | `@CurrentUser()` — extracts `request.user` |
| `decorators/roles.decorator.ts` | `@Roles(UserRole.HOD, ...)` |
| `filters/http-exception.filter.ts` | Global error formatter |
| `interceptors/logging.interceptor.ts` | Request/response logger |
| `constants/roles.enum.ts` | `UserRole` enum |
| `types/jwt-payload.type.ts` | `{ sub: string, email: string, role: UserRole }` |

---

## 3. Data Models (Prisma)

**Provider:** `sqlserver` — most tables have `ErpTS` prefix. Exception: `Department` maps to `Department` (no prefix).

**Total Prisma models: 38** (see `backend/prisma/schema.prisma`)

### User (ErpTSUser)
```
id            String   @id @default(uuid())
email         String   @unique
fullName      String
passwordHash  String
roleId        String   → Role
departmentId  String?  → Department
createdAt     DateTime
updatedAt     DateTime
```
Relations: tasks (assignee), projects (creator), chatterPosts, chatterComments, activities, leaveRequests, notifications, inboxReadMarkers, regularizationRequests, overtimeRequests, schedulerAssignments, conversations, messages, workSessions, taskDesignerEntries

### Role (ErpTSRole)
```
id          String @id
name        String @unique
permissions String?
createdAt   DateTime
updatedAt   DateTime
```

### Department (Department — no ErpTS prefix)
```
id        String @id
name      String @unique
createdAt DateTime
updatedAt DateTime
```

### Project (ErpTSProject)
```
id             String  @id @default(uuid())
projectNo      String? @unique            ← optional
name           String
category       String  @default("Project")
businessUnit   String?
description    String?
status         String  @default("ACTIVE")
salesPerson    String?
technicalHead  String?
teamLead       String?
subTeamLead    String?
createdById    String? → User             ← optional
createdAt      DateTime
updatedAt      DateTime
```
Relations: tasks[], signRows[], chatterPosts[], attachments[]

### ErpTSProjectQsStatus (raw SQL — no Prisma model)
Per-project QS workflow status. Managed via `MERGE` statements in `ProjectsService`.
```
projectId     String  (PK)
status        String  ('Pending' | 'In Progress' | 'Completed')
updatedById   String? → User
submittedById String? → User (set when status = Completed)
submittedAt   DateTime? (set once on first Completed transition)
createdAt     DateTime
updatedAt     DateTime
```

### Task (ErpTSTask)
```
id                     String   @id @default(uuid())
taskNo                 String   @unique (auto-generated)
opNo                   String?
title                  String?
revisionCode           String?
designType             String?  (Retail | Project)
signType               String?
signFamily             String?
disciplineType         String?
description            String?
status                 String   @default("DESIGN_NEW")
priority               String   @default("Medium")
projectId              String   → Project
assigneeId             String?  → User  (null for split tasks)
dueDate                DateTime?
startedAt              DateTime?
completedAt            DateTime?
holdPreviousStatus     String?
reworkNote             String?
reworkAttachmentUrl    String?
reworkAttachmentName   String?
reworkLinkUrl          String?
reworkLinkName         String?
previousRevisionTaskId String?
technicalHead          String?
teamLead               String?
subTeamLead            String?
designers              String?
createdAt              DateTime
updatedAt              DateTime
```
Relations: retailDetails[], projectDetails[], chatterPosts[], activityLogs[], regularizationRequests[], overtimeRequests[], schedulerAssignments[], workSessions[], taskDesigners[]

**Status values:** `DESIGN_NEW`, `DESIGN_PLANNED`, `IN_PROGRESS`, `DESIGN_COMPLETED`, `HOD_REVIEW`, `SALES_REVIEW`, `REWORK`, `CLIENT_ACCEPTED`, `CLIENT_REJECTED`, `ON_HOLD` (unified vocabulary — see `backend/src/tasks/task-status.util.ts` for the legacy-value mapping and `DEPLOYMENT_RUNBOOK.md` for the DB constraint migration sequencing)

**Split-task rule:** When a task is assigned to multiple designers in the scheduler, `assigneeId` is set to `null`. All assigned designers are in the `ErpTSTaskDesigner` junction table. Any query filtering by designer must check **both** `assigneeId = userId` OR `taskDesigners.some({ designerId: userId })`.

### TaskDesigner (ErpTSTaskDesigner) — split-task junction
```
id         String @id
taskId     String → Task (CASCADE delete)
designerId String → User
```
Unique constraint: `[taskId, designerId]`

### RetailTaskDetail (ErpTSRetailTaskDetail)
```
id             String  @id
taskId         String  → Task (CASCADE delete)
providedFile   String?
fileKey        String?
fileUrl        String?
hodName        String?
designTypes    String? (JSON array)
hoursRequired  Int?
comment        String?
signFamily     String?
signType       String?
planCode       String?
contractRef    String?
quantity       Int?
deadline       DateTime?
createdAt      DateTime
```
Relations: attachments[]

### ProjectTaskDetail (ErpTSProjectTaskDetail)
```
id             String  @id
taskId         String  → Task (CASCADE delete)
signType       String?
planCode       String?
area           String?
level          String?
artwork        Boolean? @default(false)
artworkHours   Int?
technical      Boolean? @default(false)
technicalHours Int?
location       Boolean? @default(false)
locationHours  Int?
asBuilt        Boolean? @default(false)
asBuiltHours   Int?
bim            Boolean? @default(false)
deadline       DateTime?
comment        String?
createdAt      DateTime
```
Relations: attachments[]

### ProjectSignRow (ErpTSProjectSignRow)
QS sign schedule rows, keyed by project (not task).
```
id          String  @id
projectId   String  → Project (CASCADE delete)
tNo         String?
no          String?
signType    String?
planCode    String?
estQty      Int?
qsQty       Int?
areaZone    String?
levelParcel String?
sequence    String?
status      String?
comment     String?
contRef     String?
signFamily  String?
createdAt   DateTime
```

### ProjectAttachment (ErpTSProjectAttachment)
```
id           String @id
projectId    String → Project (CASCADE delete)
fileKey      String
fileName     String
mimeType     String?
sizeBytes    BigInt?
uploadedById String? → User
createdAt    DateTime
```

### RetailTaskDetailAttachment / ProjectTaskDetailAttachment
Same shape (fileKey, fileName, mimeType, sizeBytes, createdAt) linked to their parent detail record.

### DesignTask (ErpTSDesignTask) — ERP Design List
```
id                   String @id
opNo                 String?
projectNo            String?
name                 String?
description          String?
designType           String?
businessUnit         String?
status               String?
salesPerson          String? (UUID → User)
assignedDesignerId   String? → User
lastUpdatedBy        String? → User
deadline             DateTime?
agingDays            Int?
priority             String?
estimatedHours       Decimal?
completedHours       Decimal?
revisionCount        Int?
completionPercentage Int?
isOverdue            Boolean?
isDeleted            Boolean?
createdAt            DateTime?
updatedAt            DateTime?
```
Relations: signageDetails[]

### SignageDetail (ErpTSSignageDetail)
```
id          String @id
taskId      String? → DesignTask
signFamily  String?
signType    String?
planCode    String?
contractRef String?
quantity    Int?
createdAt   DateTime?
```

### ChatterPost (ErpTSChatterPost)
```
id              String @id
title           String?
message         String?
postType        String?
priority        String?
visibility      String?
seenByCount     Int?   @default(0)
attachmentCount Int?   @default(0)
isPinned        Boolean? @default(false)
editedAt        DateTime?
taskId          String? → Task
projectId       String? → Project
authorId        String? → User
mentionUserId   String? → User
createdAt       DateTime?
updatedAt       DateTime?
```
Relations: attachments[], links[], comments[], mentionEntries[], likes[]

### ChatterComment (ErpTSChatterComment)
```
id            String @id
postId        String? → ChatterPost (CASCADE delete)
authorId      String? → User
mentionUserId String? → User
message       String?
createdAt     DateTime?
```
Relations: mentionEntries[]

### ChatterPostMention (ErpTSChatterPostMention)
```
id        String @id
postId    String → ChatterPost (CASCADE delete)
userId    String → User
createdAt DateTime
```
Unique: `[postId, userId]`

### ChatterCommentMention (ErpTSChatterCommentMention)
```
id        String @id
commentId String → ChatterComment (CASCADE delete)
userId    String → User
createdAt DateTime
```
Unique: `[commentId, userId]`

### ChatterPostLike (ErpTSChatterPostLike)
```
id        String @id
postId    String → ChatterPost (CASCADE delete)
userId    String → User
createdAt DateTime
```
Unique: `[postId, userId]`

### Attachment (ErpTSChatterPostAttachment)
```
id            String @id
fileName      String
filePath      String
fileUrl       String?
mimeType      String?
sizeBytes     BigInt?
chatterPostId String → ChatterPost (CASCADE delete)
createdAt     DateTime?
```

### LinkAttachment (ErpTSLinkAttachment)
```
id            String @id
url           String
platform      String?
displayName   String?
chatterPostId String → ChatterPost (CASCADE delete)
createdAt     DateTime
```

### SchedulerAssignment (ErpTSSchedulerAssignment)
```
id            String @id
designerId    String? → User
taskId        String? → Task
dayIndex      Int?
assignedHours Decimal?
parentId      String?
splitIndex    Int?
totalParts    Int?
weekStartDate DateTime? @db.Date
weekEndDate   DateTime? @db.Date
notes         String?
position      Int? @default(0)
isLocked      Boolean? @default(false)
assignedBy    String? → User
createdAt     DateTime?
updatedAt     DateTime?
```

### SchedulerWeek (ErpTSSchedulerWeek)
```
id              String   @id
weekStartDate   DateTime @unique @db.Date
version         Int      @default(0)
isLocked        Boolean  @default(false)
updatedBy       String?  → User
lastPayloadHash String?
createdAt       DateTime
updatedAt       DateTime
```

### SchedulerAssignmentHistory (ErpTSSchedulerAssignmentHistory)
```
id            String   @id
weekStartDate DateTime @db.Date
versionFrom   Int
versionTo     Int
changedBy     String?  → User
beforeJson    String?
afterJson     String?
createdAt     DateTime
```

### Holiday (ErpTSHoliday)
```
id        String   @id
date      DateTime @unique @db.Date
name      String?
createdAt DateTime
updatedAt DateTime
```

### ActivityLog (ErpTSActivityLog)
```
id        String @id
action    String
details   String?
userId    String → User
taskId    String? → Task
createdAt DateTime
```

### Notification (ErpTSNotification)
```
id        String @id
userId    String → User (CASCADE delete)
title     String
message   String
isRead    Boolean @default(false)
linkUrl   String?
createdAt DateTime
```

### InboxReadMarker (ErpTSInboxRead)
```
id        String @id
userId    String → User (CASCADE delete)
itemKey   String
isRead    Boolean @default(true)
updatedAt DateTime
```
Unique: `[userId, itemKey]`

### LeaveRequest (ErpTSLeaveRequest)
```
id               String @id
userId           String → User
type             String
status           String @default("Pending")
startDate        DateTime
endDate          DateTime?
halfDaySession   String?
reason           String?
approverId       String? → User
approverRemarks  String?
reviewedAt       DateTime?
revokedById      String? → User
revokedAt        DateTime?
revocationReason String?
createdAt        DateTime
updatedAt        DateTime
```

### RegularizationRequest (ErpTSRegularizationRequest)
```
id              String @id
designerId      String? → User
taskId          String? → Task
date            DateTime? @db.Date
duration        String?
reason          String?
notes           String?
status          String?
approverId      String? → User
approverRemarks String?
reviewedAt      DateTime?
createdAt       DateTime?
```

### OvertimeRequest (ErpTSOvertimeRequest)
```
id                 String @id
designerId         String? → User
taskId             String? → Task
date               DateTime? @db.Date
estimatedRemaining String?
requestedHours     Decimal?
approvedHours      Decimal?
reason             String?
status             String?
startTime          String?
endTime            String?
totalHours         Decimal?
managerComments    String?
hrComments         String?
approvedById       String? → User
approvedAt         DateTime?
rejectedById       String? → User
rejectedAt         DateTime?
createdAt          DateTime?
updatedAt          DateTime?
```
Relations: history[], attachments[]

### OvertimeApprovalHistory (ErpTSOvertimeApprovalHistory)
```
id         String @id
requestId  String → OvertimeRequest (CASCADE delete)
action     String
actionById String → User
comments   String?
createdAt  DateTime
```

### OvertimeAttachment (ErpTSOvertimeAttachment)
```
id                String @id
fileName          String
filePath          String
mimeType          String?
sizeBytes         BigInt?
overtimeRequestId String → OvertimeRequest (CASCADE delete)
createdAt         DateTime
```

### ErpTSLeaveRescheduleSnapshot (raw SQL — no Prisma model)
Auto-created on startup by `SchedulerAssignmentsService.onModuleInit`. Stores a JSON snapshot of each scheduler assignment row before it is displaced by an approved leave, so the original schedule can be restored if the leave is later revoked.
```
id              UNIQUEIDENTIFIER  PK DEFAULT newid()
leaveRequestId  UNIQUEIDENTIFIER  NOT NULL
assignmentId    UNIQUEIDENTIFIER  NOT NULL
originalJson    NVARCHAR(MAX)     NOT NULL  ← full assignment row JSON
createdAt       DATETIME2         DEFAULT sysutcdatetime()
restoredAt      DATETIME2         NULL      ← set when leave is revoked and row is restored
```
Unique index: `(leaveRequestId, assignmentId)` — one snapshot per assignment per leave. Rows are never deleted; `restoredAt` is stamped once on revocation.

### TaskWorkSession (ErpTSTaskWorkSession)
```
id              String @id
taskId          String → Task (CASCADE delete)
designerId      String → User
durationSeconds Int
submissionLink  String?
pauseLog        String?
status          String @default("Submitted")
submittedAt     DateTime
createdAt       DateTime
```
Relations: files[]

### TaskWorkSessionFile (ErpTSTaskWorkSessionFile)
```
id        String @id
sessionId String → TaskWorkSession (CASCADE delete)
fileKey   String
fileName  String
mimeType  String?
sizeBytes BigInt?
createdAt DateTime
```

### Conversation (ErpTSConversation)
```
id        String @id
name      String?
isGroup   Boolean @default(false)
createdAt DateTime
updatedAt DateTime
```
Relations: participants[], messages[]

### ConversationParticipant (ErpTSConversationParticipant)
```
id             String @id
conversationId String → Conversation (CASCADE delete)
userId         String → User (CASCADE delete)
joinedAt       DateTime
lastReadAt     DateTime
```
Unique: `[conversationId, userId]`

### Message (ErpTSMessage)
```
id             String @id
conversationId String → Conversation (CASCADE delete)
senderId       String → User (CASCADE delete)
content        String
createdAt      DateTime
updatedAt      DateTime
```

---

## 4. API Endpoints

Base URL: `http://localhost:4000/api/v1` (dev) | `https://task-scheduler.app-brisigns.com/api/v1` (prod)

### Auth (`/auth`)
| Method | Route | Auth | Roles | Description |
|--------|-------|------|-------|-------------|
| POST | `/auth/register` | None | — | Register new user |
| POST | `/auth/login` | None | — | Login → `{accessToken, user}` |
| GET | `/auth/me` | JWT | Any | Get current user profile |

### Users (`/users`)
| Method | Route | Auth | Roles | Description |
|--------|-------|------|-------|-------------|
| POST | `/users` | JWT | HOD | Create user |
| GET | `/users` | JWT | HOD | List users (query: role, departmentId, search) |
| GET | `/users/:id` | JWT | Any | Get user by ID |
| PATCH | `/users/:id` | JWT | HOD | Update user |
| DELETE | `/users/:id` | JWT | HOD | Delete user |

### Departments (`/departments`)
| Method | Route | Auth | Roles | Description |
|--------|-------|------|-------|-------------|
| POST | `/departments` | JWT | HOD | Create department |
| GET | `/departments` | JWT | Any | List all departments |
| GET | `/departments/:id` | JWT | Any | Get by ID |
| PATCH | `/departments/:id` | JWT | HOD | Update |
| DELETE | `/departments/:id` | JWT | HOD | Delete |

### Projects (`/projects`)
| Method | Route | Auth | Roles | Description |
|--------|-------|------|-------|-------------|
| POST | `/projects` | JWT | HOD | Create project |
| GET | `/projects` | JWT | HOD, DESIGNER, SALESPERSON, QS | List (query: status, category, search, page, limit) |
| GET | `/projects/by-project-no/:projectNo` | JWT | HOD, DESIGNER, SALESPERSON, QS | Get by projectNo (hydrates from ERP master if missing) |
| GET | `/projects/:id` | JWT | HOD, DESIGNER, SALESPERSON, QS | Get with tasks |
| POST | `/projects/:id/files` | JWT | HOD | Upload file (multipart, 20MB max) |
| POST | `/projects/:id/files/link` | JWT | HOD | Add URL link `{url, fileName}` |
| GET | `/projects/:id/files` | JWT | HOD, DESIGNER, SALESPERSON, QS | List project files |
| DELETE | `/projects/:id/files/:fileId` | JWT | HOD | Delete file |
| PATCH | `/projects/:id` | JWT | HOD | Update project |
| DELETE | `/projects/:id` | JWT | HOD | Delete project |
| GET | `/projects/:id/sign-rows` | JWT | HOD, DESIGNER, SALESPERSON, QS | Get QS sign rows for project |
| PUT | `/projects/:id/sign-rows` | JWT | HOD, QS | Full-replace sign rows (`SaveSignRowsDto`) |
| GET | `/projects/:id/qs-status` | JWT | HOD, QS | Get project QS workflow status |
| PATCH | `/projects/:id/qs-status` | JWT | HOD, QS | Update QS status (`UpdateQsStatusDto`) |
| POST | `/projects/:id/qs-submit` | JWT | HOD, QS | Save sign rows + mark Completed in one atomic call |

**Sign rows are project-scoped** (keyed by `projectId`). Task-level sign row endpoints were removed in the QS refactor (2026-06-28).

### Tasks (`/tasks`)
| Method | Route | Auth | Roles | Description |
|--------|-------|------|-------|-------------|
| POST | `/tasks` | JWT | HOD | Create basic task |
| POST | `/tasks/extended` | JWT | HOD | Create task with retail/project details |
| POST | `/tasks/upload-file` | JWT | HOD, SALESPERSON | Upload task file to S3 (20MB max) |
| GET | `/tasks` | JWT | HOD, DESIGNER, SALESPERSON, QS | List (query: projectId, status, priority, assigneeId, search, page, limit) |
| GET | `/tasks/next-revision` | JWT | HOD, DESIGNER | Get next revision code (query: projectId, projectNo, opNo, designType) |
| GET | `/tasks/next-phase` | JWT | HOD, DESIGNER, SALESPERSON | Get suggested release phase for a project's next Create-Task batch (query: projectId, projectNo, opNo, designType) — see `backend/docs/PROJECT_TASK_PHASE.md` |
| GET | `/tasks/summary` | JWT | HOD, DESIGNER | Task status counts for current user |
| GET | `/tasks/:id` | JWT | HOD, DESIGNER, SALESPERSON, QS | Get full task details |
| PATCH | `/tasks/:id` | JWT | HOD | Update task fields |
| PATCH | `/tasks/:id/assign` | JWT | HOD | Assign to designer `{assigneeId}` |
| GET | `/tasks/:id/hold-impact` | JWT | HOD, SALESPERSON | Preview scheduler parts a Hold would remove, grouped by designer (`{partCount, designers[]}`) |
| PATCH | `/tasks/:id/status` | JWT | HOD, DESIGNER, SALESPERSON | Update status `{status}`; optional `expectedAssignmentIds` (ON_HOLD consolidation guard, see below) |
| GET | `/tasks/:id/submitted-session` | JWT | HOD, DESIGNER, SALESPERSON | Fetch most recent submitted work session |
| GET | `/tasks/:id/timer-state` | JWT | HOD, DESIGNER | Fetch draft session for cold-start timer restore |
| POST | `/tasks/:id/save-timer` | JWT | HOD, DESIGNER | Upsert draft work session on start/pause |
| POST | `/tasks/:id/submit-work` | JWT | HOD, DESIGNER | Submit timer session (multipart, up to 10 files, 20MB each) |
| DELETE | `/tasks/:id` | JWT | HOD | Delete task |

**Extended create rules:**
- `task.projectName` is required (400 if missing/blank)
- For project tasks, **one `ErpTSTask` is created per `projectDetails[]` entry** — each maps to one discipline for one sign type
- Task title auto-built as `[opNo, signType, disciplineType, revisionCode].join(' - ')`
- Duplicate check includes `disciplineType` — same project/opNo/signType/revision is allowed if `disciplineType` differs
- `dueDate` per task uses `line.deadline` if present, falling back to `dto.task.dueDate`
- `ProjectDetailInputDto` accepts `signFamily` and `disciplineType` (both optional)

**Phase rule:** every task created via the Project path carries a `phase` (int, project-wide, shared across all opNo/sign types) — one value per submission, auto-suggested from the project's phase history but overridable. Resolved once per submission (unlike `revisionCode`, which can differ per line). Full detail, smart-suggestion algorithm, and known gaps: **`backend/docs/PROJECT_TASK_PHASE.md`**.

**ON_HOLD rule:** Setting status to ON_HOLD via `PATCH /tasks/:id/status` automatically deletes all future `SchedulerAssignment` rows. `GET /tasks/:id/hold-impact` previews this (grouped by designer, part counts only — no assignment ids) so the UI can warn first; `TaskDetailsPage.jsx`'s Hold button always does the plain unconditional wipe after that preview (intentional, no `expectedAssignmentIds` — the preview is informational only). Only the scheduler's drag-to-hold path passes `expectedAssignmentIds` to guard against wiping an unexpected sibling row (see Split-Task Architecture below).

### Design List (`/design-list`) — No auth required
| Method | Route | Query Params | Description |
|--------|-------|-------------|-------------|
| GET | `/design-list` | page, limit, q, type, status, salesPerson, startDate, endDate | Paginated ERP design list |
| GET | `/design-list/projects-list` | page, limit, q | Projects list from ERP |

### Chatter Posts (`/chatter-posts`)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/chatter-posts` | JWT | List posts (query: limit, taskId, projectId, mentionUserId, commentedByUserId, postType, weekStart) |
| GET | `/chatter-posts/mention-users` | JWT | List mentionable users |
| POST | `/chatter-posts` | JWT | Create post (multipart, up to 10 files); `title` optional (defaults to `"Chatter Post"`) |
| GET | `/chatter-posts/:postId/comments` | JWT | Get comments for post |
| POST | `/chatter-posts/:postId/comments` | JWT | Add comment `{message}` |

Chatter list responses include `authorName` and `authorRole`.

### Scheduler Assignments (`/scheduler-assignments`)
| Method | Route | Auth | Roles | Description |
|--------|-------|------|-------|-------------|
| GET | `/scheduler-assignments` | JWT | HOD, DESIGNER | Get assignments (query: weekStart YYYY-MM-DD, designerId — HOD omitting designerId gets the whole week) |
| GET | `/scheduler-assignments/week/:weekStart/meta` | JWT | HOD, DESIGNER | Week metadata (isLocked, version) |
| PUT | `/scheduler-assignments/week/:weekStart` | JWT | HOD | Save week snapshot (optimistic concurrency via `version`; accepts optional `overflow[]` — see Scheduler Week Save below) |
| POST | `/scheduler-assignments/week/:weekStart/lock` | JWT | HOD | Lock week |
| DELETE | `/scheduler-assignments/week/:weekStart/lock` | JWT | HOD | Unlock week |
| DELETE | `/scheduler-assignments/task/:taskId` | JWT | HOD, ADMIN, PROJECT_MANAGER | Clear all future assignment rows for a task (query: `expectedAssignmentIds` comma-separated — optional stale-consolidation guard, 409 if a live row outside the set exists) |
| POST | `/scheduler-assignments/:id/detach` | JWT | HOD | Detach one split part into its own fragment with a given status |
| POST | `/scheduler-assignments/fragments/:id/status` | JWT | HOD | Update a detached fragment's status |
| POST | `/scheduler-assignments/overtime-requests/:requestId/action` | JWT | HOD | Approve/reject an overtime request from the scheduler view |

### Regularization Requests (`/regularization-requests`)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/regularization-requests` | None | List (query: designerId UUID) |
| GET | `/regularization-requests/:id` | None | Get by ID |
| GET | `/regularization-requests/task-options` | None | Tasks assigned to designer on date (query: designerId, date YYYY-MM-DD) |
| GET | `/regularization-requests/pending-approvals` | None | HOD: pending approvals queue |
| GET | `/regularization-requests/team-requests` | None | HOD: team requests (query: status, designerId) |
| POST | `/regularization-requests` | None | Create request |
| POST | `/regularization-requests/:id/review` | None | HOD: review (approve/reject) — HOD own requests auto-approved |
| PATCH | `/regularization-requests/:id` | None | Update status |

### Overtime Requests (`/overtime-requests`)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/overtime-requests` | None | List for designer (query: designerId) |
| GET | `/overtime-requests/:id` | None | Get by ID |
| GET | `/overtime-requests/task-options` | None | Tasks assigned to designer on date (query: designerId, date YYYY-MM-DD) |
| GET | `/overtime-requests/my-requests` | None | Own requests (query: status, startDate, endDate) |
| GET | `/overtime-requests/pending-approvals` | None | HOD: pending approvals |
| GET | `/overtime-requests/team-requests` | None | HOD: team requests (query: status, designerId) |
| GET | `/overtime-requests/all` | None | HOD: paginated all (query: status, designerId, search, page, limit) |
| GET | `/overtime-requests/statistics` | None | HOD: overtime statistics |
| GET | `/overtime-requests/export` | None | HOD: export report (query: status) |
| POST | `/overtime-requests` | None | Create (optional file attachment) |
| PUT | `/overtime-requests/:id` | None | Update (optional file) |
| POST | `/overtime-requests/:id/submit` | None | Submit — HOD self-submit auto-approves immediately |
| POST | `/overtime-requests/:id/withdraw` | None | Withdraw request |
| POST | `/overtime-requests/:id/attachment` | None | Upload attachment to existing request |
| POST | `/overtime-requests/:id/review` | None | HOD: review/approve |
| DELETE | `/overtime-requests/:id` | None | Delete |

**HOD self-overtime rule:** When a HOD submits an overtime request for themselves, the request is auto-approved on `POST /overtime-requests/:id/submit` — it never enters `PENDING` status.

**Task-options endpoints:** Both `overtime-requests/task-options` and `regularization-requests/task-options` return only tasks where the designer is the assignee or listed in `ErpTSTaskDesigner` on that specific date. `designerId` and `date` are required query params.

### Requests/Leave (`/requests`)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/requests` | JWT | List own requests (query: designerId) |
| GET | `/requests/pending-approvals` | JWT | HOD: pending approvals queue |
| GET | `/requests/team-requests` | JWT | HOD: team requests (query: status, designerId) |
| POST | `/requests` | JWT | Create leave request |
| PATCH | `/requests/:id` | JWT | Update own request |
| POST | `/requests/:id/cancel` | JWT | Cancel request (Designer) |
| POST | `/requests/:id/review` | JWT | Approve/reject request (HOD) — approval triggers scheduler rescheduling |
| POST | `/requests/:id/revoke` | JWT | Revoke approved request (HOD) — revocation restores snapshots |
| PATCH | `/requests/:id/status` | JWT | Update status (HOD) |

**Leave approval → scheduler rescheduling:** When a leave request is approved via `POST /requests/:id/review`, `RequestsService` invokes `SchedulerAssignmentsService.rescheduleForApprovedLeave`. This:
1. Finds all scheduler assignments overlapping the leave period for the designer.
2. Snapshots each displaced assignment row into `ErpTSLeaveRescheduleSnapshot`.
3. Pushes those assignments forward to the next available working days (skipping weekends and holidays in `ErpTSHoliday`).
4. Logs a `SCHEDULER_LEAVE_RESCHEDULED` activity event.

**Leave revocation → snapshot restore:** When a leave is revoked via `POST /requests/:id/revoke`, `SchedulerAssignmentsService.revokeLeaveReschedule` loads snapshots for that `leaveRequestId`, restores each assignment to its original state, then stamps `restoredAt` on the snapshot rows.

**Half-day leave:** `halfDaySession` on `LeaveRequest` (`FIRST_HALF` | `SECOND_HALF`) controls which session is blocked. The scheduler UI (`designerDashboardSync.js`) normalizes this and visually reorders tasks in the affected day slot — tasks are sorted so they appear before or after the leave block based on the session.

### Activities (`/activities`)
| Method | Route | Auth | Roles | Description |
|--------|-------|------|-------|-------------|
| GET | `/activities` | JWT | HOD | Global feed (query: limit) |
| GET | `/activities/task/:taskId` | JWT | Any | Task activity (query: limit, cursor) |
| GET | `/activities/project/:projectId` | JWT | Any | Project activity (query: limit, cursor) |

### Dashboard (`/dashboard`)
| Method | Route | Auth | Roles | Description |
|--------|-------|------|-------|-------------|
| GET | `/dashboard/metrics` | JWT | Any | Task/project counts for current user |
| GET | `/dashboard/projects-overview` | JWT | HOD | Weekly snapshot (query: weekStart=YYYY-MM-DD): scheduled tasks, completed, on-hold, reallocated, inbox feed, donut summary |

### Notifications (`/notifications`)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/notifications` | JWT | User's notifications (query: limit) |
| GET | `/notifications/unread-count` | JWT | Unread count |
| PATCH | `/notifications/:id/read` | JWT | Mark as read |
| PATCH | `/notifications/:id/unread` | JWT | Mark as unread |
| POST | `/notifications/read-all` | JWT | Mark all as read |

### Chat / Conversations (`/conversations`)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/conversations` | JWT | Create DM or group conversation (or retrieve existing DM) |
| GET | `/conversations` | JWT | List all conversations for current user |
| GET | `/conversations/:id/messages` | JWT | Paginated message history (query: limit, before) |
| POST | `/conversations/:id/messages` | JWT | Send message (broadcasts `message` WS event to `conv:{id}`) |
| POST | `/conversations/:id/read` | JWT | Mark conversation as read (broadcasts `messageRead` WS event) |
| DELETE | `/conversations/:id` | JWT | Delete / leave conversation |

WebSocket gateway (`ChatGateway`) broadcasts to rooms keyed as `conv:{conversationId}`:
- `message` — new message
- `messageRead` — read confirmation `{ conversationId, userId, readAt }`

### Health (`/health`) — No auth
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/health` | `{status, timestamp, uptime}` |

---

## 5. DTOs Reference

### Auth
```typescript
LoginDto:         { email: string, password: string (min 6) }
RegisterDto:      { email, fullName (min 2), password (min 6), role: UserRole }
```

### Users
```typescript
CreateUserDto:    { email, fullName (min 2), password (min 6), role: UserRole, departmentId?: UUID }
UpdateUserDto:    { fullName?, role?, departmentId?, password? (min 6) }
```

### Projects
```typescript
CreateProjectDto:     { name (min 2), projectNo?, category: 'Retail'|'Project', businessUnit?, description?, status: 'ACTIVE'|'COMPLETED'|'ON_HOLD', salesPerson? }
UpdateProjectDto:     All fields optional
CreateProjectFileLinkDto: { url (valid absolute URL, max 1024), fileName (1-255 chars) }

// QS sign rows
ProjectSignRowDto: {
  id?: UUID (existing row — omit for new)
  tNo: string, no: string, signType: string, planCode: string,
  estQty: int, qsQty: int, areaZone: string, levelParcel: string,
  sequence: string, status: string, contRef: string,
  comment?: string, signFamily?: string
}
SaveSignRowsDto:   { rows: ProjectSignRowDto[] }
UpdateQsStatusDto: { status: 'Pending'|'In Progress'|'Completed', note?: string }
```

### Tasks
```typescript
CreateTaskDto: {
  title, revisionCode?, designType?, opNo?, description?,
  projectNo, assigneeId?: UUID, priority: 'High'|'Medium'|'Low', dueDate: ISO date
}

CreateExtendedTaskDto: {
  task: {
    title, revisionCode?, designType?, opNo?, description?,
    projectId: UUID, projectNo, projectName (required, min 2), businessUnit?,
    sourceRecordId?, assigneeId?: UUID, priority, dueDate
  },
  designType: 'Retail' | 'Project',
  retailDetails?: [{
    providedFile?, fileKey?, fileUrl?, hodName?,
    designTypes?: string[], hoursRequired?, comment?,
    signFamily?, signType?, planCode?, contractRef?,
    quantity?, deadline?, attachments?: TaskAttachmentInputDto[]
  }],
  projectDetails?: [{
    signType?, planCode?, area?, level?,
    artwork?: bool, artworkHours?,
    technical?: bool, technicalHours?,
    location?: bool, locationHours?,
    asBuilt?: bool, asBuiltHours?,
    bim?: bool, deadline?, comment?,
    signFamily?, disciplineType?,
    attachments?: TaskAttachmentInputDto[]
  }]
}

TaskAttachmentInputDto: { fileKey: string, fileName: string, mimeType: string, size: number }

UpdateTaskDto:          { title? (min 2), description?, priority?, dueDate? }
AssignTaskDto:          { assigneeId: UUID }
UpdateTaskStatusDto:    { status: 'DESIGN_NEW'|'DESIGN_PLANNED'|'IN_PROGRESS'|'DESIGN_COMPLETED'|'HOD_REVIEW'|'SALES_REVIEW'|'REWORK'|'CLIENT_ACCEPTED'|'CLIENT_REJECTED'|'ON_HOLD', expectedAssignmentIds?: UUID[] (ON_HOLD-only consolidation guard), reworkNote?, reworkAttachmentUrl?, reworkAttachmentName?, reworkLinkUrl?, reworkLinkName? }

SubmitWorkDto:          { durationSeconds: number, submissionLink?: string, pauseLog?: string }
SaveTimerStateDto:      { durationSeconds: number, pauseLog?: string }
```

### Chatter
```typescript
CreateChatterPostDto: {
  taskId?: UUID, projectId?: UUID, title?,
  message (required), postType?, mentionUserId?: UUID, priority?, visibility?
}
CreateChatterCommentDto: { message (1-8000 chars) }
```

### Scheduler
```typescript
SaveSchedulerWeekDto: {
  version: number (min 0),
  assignments: [{
    designerId: UUID, taskId: UUID, dayIndex: 0-6,
    assignedHours: number (min 0.01, 2 decimal places),
    parentId?: UUID, splitIndex?: number (min 1),
    totalParts?: number (min 1), position?: number,
    notes?: string, isPinned?: boolean,
    isLocked?: boolean   // logged-time remainder after partial handoff — non-draggable audit slice
  }],
  resolvedFragmentIds?: UUID[],   // fragment rows this save resolves; deleted server-side in the same transaction
  affectedTaskIds?: UUID[],       // when set, only these tasks' rows in this week are replaced (partial/merge save)
  overflow?: [{                  // hours that didn't fit in the saved week — placed server-side (Rule 3)
    designerId: UUID, taskId: UUID,
    hours: number (min 0.01, 2 decimal places), isPinned?: boolean
  }]
}
```

### Requests
```typescript
CreateRegularizationRequestDto: {
  designerId: UUID, taskId: UUID, date: 'YYYY-MM-DD',
  duration (1-80 chars), reason (1-200 chars),
  notes? (max 2000), status? (max 40)
}
UpdateRegularizationStatusDto: { status: 'Approved'|'Rejected'|'Pending', approverId?: UUID }

CreateOvertimeRequestDto: {
  designerId: UUID, taskId: UUID, date: 'YYYY-MM-DD',
  estimatedRemaining (1-80), requestedHours (1-80), reason (1-500), status? (max 40)
}
UpdateOvertimeDto: { status: 'Approved'|'Rejected'|'Pending', approvedHours?: string (max 80) }

CreateLeaveRequestDto: {
  userId, type: 'Leave'|'Half Day'|'Regularization',
  startDate: ISO, endDate?: ISO, halfDaySession?: string, reason?
}
UpdateRequestStatusDto: { status: 'APPROVED'|'REJECTED'|'PENDING' }
```

### Chat
```typescript
CreateConversationDto: { participantIds: UUID[], name?: string, isGroup?: boolean }
SendMessageDto:        { content: string }
```

---

## 6. Frontend Architecture

### Tech Stack
- **Framework:** Next.js 16.2.3, React 19.2.4 (App Router)
- **Styling:** Tailwind CSS v4 + PostCSS
- **Forms:** react-hook-form + zod
- **Tables:** @tanstack/react-table, @tanstack/react-virtual
- **Icons:** lucide-react, react-icons
- **Date picker:** react-datepicker
- **Language:** Mix of JSX and TypeScript

### Directory Structure
```
frontend/src/
├── app/                   Next.js App Router pages
│   ├── (auth)/login/      Login page
│   ├── designer/[designerId]/  Designer dashboard + sub-pages
│   ├── design-list/       Design list views
│   ├── design-scheduler/  HOD scheduler
│   ├── projects-list/     Project table
│   ├── projects-overview/ Overview dashboard
│   ├── retail/[projectRowId]/  Retail project detail
│   ├── chatter/           Chatter feed
│   ├── team-activity/     HOD activity feed
│   ├── task-summary/[taskId]/
│   ├── retail-task-creation/[id]/
│   ├── retail-task-view/[id]/
│   ├── project-task-creation/[id]/
│   ├── project-task-view/[id]/
│   ├── qs/projects/       QS project list (HOD, QS)
│   ├── qs/projects/[id]/  QS project detail — sign rows + status (HOD, QS)
│   └── sales/tasks/       Sales task view (SALESPERSON, HOD)
├── components/            Shared UI components
│   ├── Navbar.jsx
│   ├── DesignProviders.jsx
│   ├── CreateTaskModal.jsx
│   ├── ProjectCreateTaskModal.jsx
│   ├── ProjectTaskTimer.jsx
│   └── ui/ (button, input)
├── features/              Feature modules (services + components)
│   ├── auth/services/auth.api.ts
│   ├── design-list/components/, task-view-model.js
│   ├── projects/components/
│   ├── scheduler/services/, components/, utils/
│   ├── team-activity/services/, components/, lib/
│   ├── chatter/services/, components/, utils/
│   └── requests/services/
├── views/                 Full-page view components
│   ├── DesignListRecordPage.jsx
│   ├── TaskViewPage.jsx
│   ├── TaskDetailsPage.jsx
│   ├── TaskCreatePage.jsx
│   └── RetailProjectPage.jsx
├── state/
│   └── DesignListContext.jsx   Global design list state
├── lib/
│   ├── api-client.ts      HTTP client (JWT, FormData, date parsing)
│   ├── api-error.ts       Error message extraction
│   ├── auth-token.ts      localStorage JWT management
│   ├── env.ts             API base URL config
│   ├── utils.ts           Date formatting, cn() classname utility
│   ├── mock-auth.js       Session helpers (getSession, logout, getHomeRoute)
│   ├── use-role-guard.js  Hook: redirect if current role not in allowed list
│   ├── designers.js       Designer lookup helpers
│   ├── design-list-routes.js  Route builders (retail vs project)
│   └── design-list-date.js    Date parsing for ERP design list
├── constants/icons.js
└── data/designers/d1.json
```

---

## 7. Page Routes

| Route | Component | Auth | Role Access | Purpose |
|-------|-----------|------|-------------|---------|
| `/` | `app/page.jsx` | — | — | Redirect → `/login` |
| `/(auth)/login` | `login-form.jsx` | None | — | Login with demo account options |
| `/design-list` | `DesignListScreen.jsx` | Session | HOD | Full ERP design task list with filters |
| `/design-list/tasks` | `DesignerDesignListScreen.jsx` | Session | Designer | Personal assigned work queue |
| `/design-list/record/[taskId]` | `DesignListRecordPage.jsx` | Session | Any | Task record detail (legacy, 3-tab) |
| `/design-list/task/[taskId]` | `page.jsx` | Session | Any | Task detail view |
| `/task-summary/[taskId]` | `page.jsx` | Session | Any | Task summary view |
| `/retail-task-creation/[id]` | `TaskCreatePage.jsx` | Session | HOD, PM | Retail task creation form |
| `/retail-task-view/[id]` | `TaskViewPage.jsx` | Session | Any | Retail task view |
| `/project-task-creation/[id]` | `TaskCreatePage.jsx` | Session | HOD, PM | Project task creation form |
| `/project-task-view/[id]` | `TaskViewPage.jsx` | Session | Any | Project task view |
| `/retail/[projectRowId]` | `RetailProjectPage.jsx` | Session | Any | Retail project detail + chatter + files |
| `/projects-list` | `ProjectScreen.jsx` | Session | Any | Paginated project table |
| `/projects-overview` | `ProjectsOverviewScreen.jsx` | Session | HOD | Project overview dashboard |
| `/project-design` | `ProjectDesignHub.jsx` | Session | Any | Project design hub |
| `/design-scheduler` | `DesignSchedulerScreen.jsx` | Session | HOD | Weekly drag-drop task scheduler |
| `/team-activity` | `TeamActivityFeedScreen.jsx` | Session | HOD | Global activity feed |
| `/chatter` | `ChatterScreen.jsx` | Session | Any | Team chatter/comments |
| `/designer/[designerId]` | `DesignerDashboard.jsx` | Session | Designer | Personal dashboard: workload, stats |
| `/designer/[designerId]/leave-planner` | `page.jsx` | Session | Designer | Leave request management |
| `/designer/[designerId]/requests` | `page.jsx` | Session | Designer | Request status |
| `/designer/[designerId]/team-activity` | `page.jsx` | Session | Designer | Personal activity timeline |
| `/qs/projects` | `page.jsx` | Session | QS, HOD | QS project list with status overview |
| `/qs/projects/[id]` | `page.jsx` | Session | QS, HOD | QS project detail — sign rows table + status control |
| `/sales/tasks` | `page.jsx` | Session | SALESPERSON, HOD | Sales task view |

---

## 8. API Client & Data Flow

### API Client (`frontend/src/lib/api-client.ts`)
```typescript
export const apiClient = {
  get<T>(path: string): Promise<T>
  post<T>(path: string, body: unknown): Promise<T>
  patch<T>(path: string, body: unknown): Promise<T>
  put<T>(path: string, body: unknown): Promise<T>
  delete<T>(path: string): Promise<T>
}
```

**Behaviors:**
- Auto-injects `Authorization: Bearer <token>` from `getAccessToken()` (localStorage)
- If body is `FormData`, skips `Content-Type` (browser sets multipart boundary)
- Otherwise sends `Content-Type: application/json`
- Parses JSON responses with `dateReviver` — auto-converts ISO strings to `Date` objects
- On `401` → calls `clearAccessToken()`, throws `Error('Unauthorized')`
- Base URL: `env.apiBaseUrl` → `NEXT_PUBLIC_API_BASE_URL` → `http://localhost:7000/api/v1` (dev default)

### Authentication Flow
```
1. POST /auth/login → { accessToken, user: {id, email, fullName, role} }
2. setAccessToken(accessToken) → localStorage['br_token']
3. setSession({id, email, fullName, role}) → localStorage['br_session']
4. getHomeRoute(role) → HOD: '/design-list', Designer: '/design-list/tasks'
5. Every request: Authorization: Bearer <token>
6. 401 → clearAccessToken(), redirect /login
```

### Feature API Services
| File | Functions |
|------|-----------|
| `auth.api.ts` | `loginApi(email, password)` |
| `activities.api.ts` | `fetchTeamActivities({limit})`, `fetchTaskActivities(taskId, {limit, cursor})`, `fetchProjectActivities(projectId, {limit, cursor})` |
| `chatter-posts.api.ts` | `listChatterPosts({limit, taskId?, projectId?})`, `createChatterPost(data, files?)`, `listComments(postId)`, `createComment(postId, {message})`, `fetchMentionUsers()` |
| `requests.api.ts` | `fetchLeaveRequests(designerId?)`, `createLeaveRequest(data)`, `updateRequestStatus(id, status)` |
| `scheduler-assignments.api.ts` | `listSchedulerAssignments(weekStart)`, `getWeekMeta(weekStart)`, `saveSchedulerWeek(weekStart, payload)` |

### State Management
**DesignListContext** (`frontend/src/state/DesignListContext.jsx`) — only global state:
- `records` — raw ERP design tasks from `/design-list`
- `query`, `status`, `typeFilters`, `salesPerson`, `createdDateRange` — filter state
- Computed (useMemo): `filtered`, `statusOptions`, `typeOptions`, `salesPersonOptions`
- Methods: `updateRecord(id, patch)`, `cycleStatus(id)`, `resetFilters()`
- Consumer hook: `useDesignListStore()`

All other state is local component `useState`. No Redux/Zustand.

---

## 9. Authentication & RBAC

### User Roles (enum `UserRole`)
| Role | Key | Typical Access |
|------|-----|---------------|
| `ADMIN` | Admin | Full system access, delete operations |
| `HOD` | Head of Department | Create/manage users, tasks, projects, scheduler |
| `PROJECT_MANAGER` | PM | Create/manage tasks and projects |
| `DESIGNER` | Designer | View assigned work, update status, requests |
| `SALESPERSON` | Salesperson | Read-only project/task access |
| `QS` | Quantity Surveyor | Manage QS sign rows and QS status on assigned projects |

### Guards
- **JwtAuthGuard** — applied via `@UseGuards(JwtAuthGuard)` on controller/method
  - Production: validates `Authorization: Bearer <jwt>` signed with `JWT_ACCESS_SECRET`
  - Development (`NODE_ENV !== 'production'`): accepts `X-Dev-User-Id`, `X-Dev-User-Email`, `X-Dev-User-Role` headers to bypass token validation
- **RolesGuard** — applied after JwtAuthGuard, reads `@Roles()` decorator

### Auth Modes (`AUTH_MODE` env var)
- **`demo`** (default): Internal JWT minted by backend on `/auth/login`
- **`external`**: Validates JWT from existing ERP system using `EXTERNAL_JWT_SECRET`; maps external role labels via `EXTERNAL_ROLE_MAP` JSON

---

## 10. Environment Variables

### Backend (`backend/.env`)
```
NODE_ENV=development
PORT=4000
API_PREFIX=api/v1

# Database (SQL Server)
DATABASE_URL=sqlserver://SERVER:PORT;database=DBNAME;user=USER;password=PASS;encrypt=true;trustServerCertificate=true
# OR individual vars:
DB_SERVER=
DB_PORT=1433
DB_NAME=
DB_USER=
DB_PASSWORD=
DB_ENCRYPT=true
DB_TRUST_SERVER_CERTIFICATE=true

# JWT
JWT_ACCESS_SECRET=<min 16 chars>
JWT_ACCESS_EXPIRES_IN=1d

# Auth mode
AUTH_MODE=demo   # or: external
# External auth only:
EXTERNAL_JWT_SECRET=
EXTERNAL_SUB_FIELD=sub
EXTERNAL_EMAIL_FIELD=email
EXTERNAL_ROLE_FIELD=role
EXTERNAL_ROLE_MAP={"Hod":"HOD","Designer":"DESIGNER","ProjectManager":"PROJECT_MANAGER"}

# CORS
CORS_ORIGIN=http://localhost:3000,http://localhost:5000
LOG_LEVEL=debug

# ERP integration
ERP_CHATTER_POST_TABLE=ErpTSChatterPost
ERP_SQL_CATALOG=          # Optional cross-DB catalog name
ERP_CHATTER_POST_SQL_OBJECT=  # Full override path

# AWS S3
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=ap-south-1
AWS_BUCKET=
AWS_FOLDER=taskfiles
```

### Frontend (`frontend/.env.local`)
```
NODE_ENV=development
NEXT_PUBLIC_APP_NAME=TaskScheduler
NEXT_PUBLIC_WEB_URL=http://localhost:5000
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api/v1
```

---

## 11. Key Conventions & Patterns

### Naming Conventions
- **Database tables:** `ErpTS` prefix (e.g., `ErpTSUser`, `ErpTSTask`, `ErpTSProject`). Exception: `Department` has no prefix.
- **IDs:** UUIDs (`@default(dbgenerated("newid()"))`) throughout
- **Auto-generated codes:** `taskNo` generated server-side; `revisionCode` from `/tasks/next-revision` endpoint
- **Status enums:** UPPER_CASE or `DESIGN_NEW` for task/project status; Title Case for request status (Pending/Approved/Rejected)
- **File keys:** AWS S3 object keys stored in `fileKey`; public URL in `fileUrl`

### Split-Task Architecture
- A task split across multiple designers in the scheduler sets `assigneeId = null`. All designers are in `ErpTSTaskDesigner`.
- **Any query filtering by designer must check both:** `assigneeId = userId` OR `taskDesigners.some({ designerId: userId })`.
- Setting ON_HOLD auto-deletes all future `SchedulerAssignment` rows for the task.
- **Stale-consolidation guard:** both `PATCH /tasks/:id/status` (ON_HOLD) and `DELETE /scheduler-assignments/task/:taskId` accept an optional `expectedAssignmentIds` list of the caller's known-live row ids; if the server finds a live row outside that set it throws `ConflictException` instead of silently deleting it. `scheduler-assignments.service.ts`'s `clearTaskSchedule` wraps the check+delete in a transaction; `tasks.service.ts`'s `updateStatus` ON_HOLD path currently does **not** (two separate non-transactional Prisma calls with a mutation in between) — the two implementations are not equally atomic despite similar guard comments.
- Cross-designer handoff pauses the origin designer's running timer (`freezeDraftWorkSession(closeSession=false)` clears `runStartedAt`) and sends a "Timer Paused" notification when other slices remain — see `backend/docs/SCHEDULER_TIME_MODEL.md`.
- Notifications for status changes (COMPLETED, REWORK) and scheduler saves are sent to all junction-table designers, not just `assigneeId`.
- Work submission (`POST /tasks/:id/submit-work`) builds submitter display name from junction when `assigneeId` is null.
- SQL migration: `backend/prisma/sql/add-task-designer-junction.sql`

### File Upload Pattern
```
1. Client: POST /tasks/upload-file (multipart, file field)
2. Server: Upload to S3 → return { fileKey, fileUrl, fileName, mimeType, size }
3. Client: Store fileKey/fileUrl in TaskAttachmentInputDto[]
4. Client: POST /tasks/extended with attachments[] including those keys
```
File size limits: 20MB for tasks/projects; 20MB per file for chatter (10 files max) and work submission (10 files max).

### Pagination Pattern
```
Query params: page=1&limit=20 (default varies by endpoint)
Response: { data: [], total, page, limit, totalPages }
```
Cursor-based pagination used for activities: `{ data: [], pageInfo: { hasMore, nextCursor } }`

### Activity Logging
`ActivityLog` records are created automatically in task/project services on significant state changes.

**Currently logged:** `TASK_CREATED`, `ASSIGNED_TASK`, `STATUS_CHANGED`, `TASK_FILE_UPLOADED`, `PROJECT_FILE_UPLOADED`, `PROJECT_FILE_DELETED`, `CREATED_CHATTER_POST`, `CREATED_CHATTER_COMMENT`, `TASK_WORK_SUBMITTED`, `SCHEDULER_WEEK_SAVED`, `SCHEDULER_WEEK_LOCKED`, `SCHEDULER_WEEK_UNLOCKED`, `SCHEDULER_LEAVE_RESCHEDULED`

**Not yet logged:** Leave/overtime/regularization lifecycle events (approval, rejection, withdrawal), chatter reactions/likes/edits/deletes, dashboard views.

Full coverage list: `backend/docs/ACTIVITY_LOG_COVERAGE.md`

### Scheduler Week Save (Optimistic Concurrency)
- `PUT /scheduler-assignments/week/:weekStart` — full snapshot replace (or partial, when `affectedTaskIds` is set)
- `version` field prevents lost updates: backend rejects if client `version` < current `version`
- History recorded in `SchedulerAssignmentHistory` (versionFrom, versionTo, before/after JSON)
- Week can be locked (`isLocked: true`); locked weeks reject PUT operations
- Optional `overflow[]` in the request is placed server-side via `placeOverflowCapacity` (see `SCHEDULER_RULES.md` Rule 3); response includes `overflowPlacements` and `unplacedOverflow`, and `dashboardRealtime` notifications gain `affectedWeekStarts` when overflow touched a week other than the one being saved
- ⚠️ `placeOverflowCapacity` does not check the destination week's `isLocked` flag before writing to it — see `backend/docs/SCHEDULER_FIXES_NEEDED.md` item 11

### Route Building (Frontend)
`frontend/src/lib/design-list-routes.js` — helper to build correct routes:
```javascript
getTaskRoute(task)  // → /retail-task-view/:id or /project-task-view/:id based on designType
getTaskCreateRoute(projectId, designType)  // → retail-task-creation or project-task-creation
```

### Session & Auth Helpers
- `getAccessToken()` / `setAccessToken(token)` / `clearAccessToken()` — `localStorage['br_token']`
- `getSession()` / `setSession(user)` — `localStorage['br_session']`
- `getHomeRoute(role)` — returns `/design-list` (HOD) or `/design-list/tasks` (Designer)
- `logout()` — clears both localStorage keys

### Error Handling (Frontend)
- `api-error.ts` — extracts `error.response?.data?.message` or falls back to `error.message`
- Components show inline error strings; no global error boundary currently

### Chatter Post Scoping
- `taskId` scopes chatter to a specific task
- `projectId` scopes to a project
- Both can be null for global posts
- `GET /chatter-posts?taskId=X` or `?projectId=X` filters accordingly

---

## 12. Scripts & Development Setup

### Quick Start
```bash
# From D:\Scheduler root
npm install          # Install all workspace deps
npm run dev          # Run backend (4000) + frontend (5000) concurrently
```

### Root Scripts
```bash
npm run dev                  # Both backend + frontend
npm run dev:backend          # NestJS watch mode only
npm run dev:frontend         # Next.js dev only
npm run build                # Build both
npm run lint                 # Lint both
npm run typecheck            # TypeScript check both
npm run prisma:generate      # Regenerate Prisma client after schema changes
npm run prisma:migrate       # Apply pending migrations
npm run prisma:seed          # Seed demo roles and users
npm run prisma:setup         # generate + ensure tables/FKs
npm run prisma:audit-schema  # Check ErpTS schema integrity
```

### Backend-only Scripts (`cd backend`)
```bash
npm run start:dev    # NestJS watch mode
npm run start:prod   # Production: node dist/src/main.js
npm run test         # Jest unit tests
npm run test:e2e     # End-to-end tests
npm run lint         # ESLint
npm run format       # Prettier
npm run typecheck    # tsc --noEmit
```

### Frontend-only Scripts (`cd frontend`)
```bash
npm run dev          # Next.js dev (port 5000)
npm run build        # Production build
npm run start        # Production server
npm run lint         # ESLint
```

### Database / Prisma Workflow
```bash
# After editing schema.prisma:
npm run prisma:generate  # Regenerate client types

# Apply SQL migrations (new tables/columns):
# 1. Create SQL file in backend/prisma/sql/
# 2. Run manually against SQL Server OR
npm run prisma:migrate   # via Prisma migrate

# Seed initial data:
npm run prisma:seed      # Creates roles + demo users
```

Demo users created by seed:
- `sarah.mitchell@bluerhine.com` / `hod123` (HOD)
- `alex.johnson@bluerhine.com` / `alex123` (Designer)
- `alexander.allen@bluerhine.com` / `alex123` (Designer)
- `benjamin.harris@bluerhine.com` / `ben123` (Designer)

### Deployment (Linux/Ubuntu via PM2)
```bash
# Build
npm run build

# Deploy via WinSCP → /home/ubuntu/bri-erp-api/task-scheduler/
# Restart PM2
pm2 restart <backend-id>
pm2 restart <frontend-id>

# Health check
curl https://task-scheduler.app-brisigns.com/api/v1/health
```

---

## 13. SQL Migration Files (`backend/prisma/sql/`)

| File | Purpose |
|------|---------|
| `add-task-attachments.sql` | Creates ErpTSProjectAttachment, ErpTSRetailTaskDetailAttachment, ErpTSProjectTaskDetailAttachment tables |
| `add-task-revision-fields.sql` | Adds revisionCode, designType, title to task table; composite index on (projectId, opNo, designType, revisionCode) |
| `add-task-designer-junction.sql` | Creates ErpTSTaskDesigner junction table for split-task multi-designer support |
| `create-erp-ts-activity-log.sql` | Creates ErpTSActivityLog table with FKs to User and Task |
| `create-scheduler-acid.sql` | Scheduler transactional integrity constraints |
| `ensure-erp-ts-foreign-keys.sql` | Ensures FK constraints across ERP tables |
| `fix-passwords-for-login.sql` | Password field migration |

---

*Last updated: 2026-06-28. Generated from full codebase analysis.*
