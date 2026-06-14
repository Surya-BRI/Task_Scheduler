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
└── DashboardModule
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

**Provider:** `sqlserver` — all tables have `ErpTS` prefix in the database.

### User (ErpTSUser)
```
id            String   @id @default(uuid())
email         String   @unique
fullName      String
passwordHash  String
role          String   (UserRole enum: HOD|DESIGNER|PROJECT_MANAGER|SALESPERSON|ADMIN)
departmentId  String?  → Department
createdAt     DateTime
updatedAt     DateTime
```
Relations: tasks (assignee), projects (creator), activities, chatterPosts, requests, regularizationRequests, overtimeRequests, schedulerAssignments

### Role
```
id          String @id
name        String @unique
permissions String (JSON or comma-separated)
```

### Department
```
id        String @id @default(uuid())
name      String @unique
createdAt DateTime
updatedAt DateTime
```
Relations: users[]

### Project (ErpTSProject)
```
id           String  @id @default(uuid())
projectNo    String  @unique
name         String
category     String  (Retail | Project)
businessUnit String?
description  String?
status       String  (ACTIVE | COMPLETED | ON_HOLD)
salesPerson  String?
createdById  String  → User
createdAt    DateTime
updatedAt    DateTime
```
Relations: tasks[], attachments[]

### Task (ErpTSTask)
```
id            String   @id @default(uuid())
taskNo        String   @unique (auto-generated)
opNo          String?
title         String
revisionCode  String?
designType    String?  (Retail | Project)
description   String?
status        String   (PENDING|WIP|COMPLETED|REVISION|APPROVED|ON_HOLD)
priority      String   (High|Medium|Low)
projectId     String   → Project
projectNo     String?
assigneeId    String?  → User
dueDate       DateTime?
sourceRecordId String?
createdAt     DateTime
updatedAt     DateTime
```
Relations: retailTaskDetail, projectTaskDetail, chatterPosts, activityLogs, regularizationRequests, overtimeRequests, schedulerAssignments

### RetailTaskDetail
```
id             String  @id @default(uuid())
taskId         String  @unique → Task
providedFile   Boolean?
fileKey        String?
fileUrl        String?
hodName        String?
designTypes    String? (JSON array)
hoursRequired  Float?
comment        String?
signFamily     String?
signType       String?
planCode       String?
contractRef    String?
quantity       Int?
deadline       DateTime?
```
Relations: attachments[]

### ProjectTaskDetail
```
id             String  @id @default(uuid())
taskId         String  @unique → Task
signType       String?
planCode       String?
area           String?
level          String?
artwork        Boolean @default(false)
artworkHours   Float?
technical      Boolean @default(false)
technicalHours Float?
location       Boolean @default(false)
locationHours  Float?
asBuilt        Boolean @default(false)
asBuiltHours   Float?
bim            Boolean @default(false)
deadline       DateTime?
comment        String?
```
Relations: attachments[]

### ProjectAttachment (ErpTSProjectAttachment)
```
id         String @id @default(uuid())
projectId  String → Project
fileKey    String
fileName   String
fileUrl    String
mimeType   String?
size       Int?
uploadedAt DateTime
```

### RetailTaskDetailAttachment / ProjectTaskDetailAttachment
Same shape as ProjectAttachment but linked to RetailTaskDetail / ProjectTaskDetail respectively.

### DesignTask (ErpTSDesignTask) — ERP Design List
```
id          String @id
recordId    String?
projectNo   String?
opNo        String?
itemName    String?
status      String?
type        String?
salesPerson String?
assigneeId  String? → User
createdAt   DateTime
updatedAt   DateTime
```
Relations: signageDetail

### SignageDetail
```
id           String @id @default(uuid())
designTaskId String @unique → DesignTask
signFamily   String?
signType     String?
... (additional signage fields)
```

### ChatterPost (ErpTSChatterPost)
```
id            String @id @default(uuid())
taskId        String? → Task
projectId     String? → Project
title         String?
message       String
postType      String?
mentionUserId String? → User
priority      String?
visibility    String?
authorId      String → User
createdAt     DateTime
updatedAt     DateTime
```
Relations: comments[], attachments[], linkAttachments[]

### ChatterComment
```
id        String @id @default(uuid())
postId    String → ChatterPost
message   String
authorId  String → User
createdAt DateTime
```

### Attachment / LinkAttachment
File and URL attachments on ChatterPost.

### SchedulerAssignment
```
id            String @id @default(uuid())
weekStart     DateTime
designerId    String → User
taskId        String → Task
dayIndex      Int    (0=Mon … 6=Sun)
assignedHours Float
parentId      String? (for split tasks)
splitIndex    Int?
totalParts    Int?
notes         String?
version       Int    @default(0)
createdAt     DateTime
updatedAt     DateTime
```

### SchedulerWeek
```
id        String   @id @default(uuid())
weekStart DateTime @unique
isLocked  Boolean  @default(false)
version   Int      @default(0)
lockedAt  DateTime?
lockedById String? → User
```

### SchedulerAssignmentHistory
```
id          String @id @default(uuid())
weekStart   DateTime
action      String
beforeJson  String?
afterJson   String?
changedById String → User
changedAt   DateTime
```

### ActivityLog (ErpTSActivityLog)
```
id        String @id @default(uuid())
userId    String → User
taskId    String? → Task
projectId String?
action    String
details   String?
createdAt DateTime
```

### LeaveRequest
```
id        String @id @default(uuid())
userId    String → User
type      String (Leave | Half Day | Regularization)
startDate DateTime
endDate   DateTime?
reason    String?
status    String (PENDING | APPROVED | REJECTED)
createdAt DateTime
updatedAt DateTime
```

### RegularizationRequest
```
id           String @id @default(uuid())
designerId   String → User
taskId       String → Task
date         DateTime
duration     String
reason       String
notes        String?
status       String (Pending | Approved | Rejected)
approverId   String?
createdAt    DateTime
```

### OvertimeRequest
```
id                 String @id @default(uuid())
designerId         String → User
taskId             String → Task
date               DateTime
estimatedRemaining String
requestedHours     String
approvedHours      String?
reason             String
status             String (Pending | Approved | Rejected)
createdAt          DateTime
```

### Notification
```
id        String @id @default(uuid())
userId    String → User
message   String
isRead    Boolean @default(false)
createdAt DateTime
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
| POST | `/users` | JWT | HOD, ADMIN | Create user |
| GET | `/users` | JWT | HOD, ADMIN | List users (query: role, departmentId, search) |
| GET | `/users/:id` | JWT | Any | Get user by ID |
| PATCH | `/users/:id` | JWT | HOD, ADMIN | Update user |
| DELETE | `/users/:id` | JWT | ADMIN | Delete user |

### Departments (`/departments`)
| Method | Route | Auth | Roles | Description |
|--------|-------|------|-------|-------------|
| POST | `/departments` | JWT | HOD, ADMIN | Create department |
| GET | `/departments` | JWT | Any | List all departments |
| GET | `/departments/:id` | JWT | Any | Get by ID |
| PATCH | `/departments/:id` | JWT | HOD, ADMIN | Update |
| DELETE | `/departments/:id` | JWT | ADMIN | Delete |

### Projects (`/projects`)
| Method | Route | Auth | Roles | Description |
|--------|-------|------|-------|-------------|
| POST | `/projects` | JWT | HOD, ADMIN | Create project |
| GET | `/projects` | JWT | Any | List (query: status, category, search, page, limit) |
| GET | `/projects/by-project-no/:projectNo` | JWT | Any | Get by projectNo |
| GET | `/projects/:id` | JWT | Any | Get with tasks |
| POST | `/projects/:id/files` | JWT | HOD, ADMIN, PM | Upload file (multipart, 20MB max) |
| POST | `/projects/:id/files/link` | JWT | HOD, ADMIN, PM | Add URL link `{url, fileName}` |
| GET | `/projects/:id/files` | JWT | Any | List project files |
| DELETE | `/projects/:id/files/:fileId` | JWT | HOD, ADMIN, PM | Delete file |
| PATCH | `/projects/:id` | JWT | HOD, ADMIN | Update project |
| DELETE | `/projects/:id` | JWT | ADMIN | Delete project |

### Tasks (`/tasks`)
| Method | Route | Auth | Roles | Description |
|--------|-------|------|-------|-------------|
| POST | `/tasks` | JWT | HOD, ADMIN, PM | Create basic task |
| POST | `/tasks/extended` | JWT | HOD, ADMIN, PM | Create task with retail/project details |
| POST | `/tasks/upload-file` | JWT | HOD, ADMIN, PM | Upload task file (20MB max) |
| GET | `/tasks` | JWT | Any | List (query: projectId, status, priority, assigneeId, search, page, limit) |
| GET | `/tasks/next-revision` | JWT | Any | Get next revision code (query: projectId, projectNo, opNo, designType) |
| GET | `/tasks/summary` | JWT | Any | Task status counts for current user |
| GET | `/tasks/:id` | JWT | Any | Get full task details |
| PATCH | `/tasks/:id` | JWT | HOD, ADMIN, PM | Update task fields |
| PATCH | `/tasks/:id/assign` | JWT | HOD, ADMIN | Assign to designer `{assigneeId}` |
| PATCH | `/tasks/:id/status` | JWT | Any | Update status `{status}` |
| DELETE | `/tasks/:id` | JWT | ADMIN | Delete task |

### Design List (`/design-list`) — No auth required
| Method | Route | Query Params | Description |
|--------|-------|-------------|-------------|
| GET | `/design-list` | page, limit, q, type, status, salesPerson, startDate, endDate | Paginated ERP design list |
| GET | `/design-list/projects-list` | page, limit, q | Projects list from ERP |

### Chatter Posts (`/chatter-posts`)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/chatter-posts` | JWT | List posts (query: limit, taskId, projectId) |
| GET | `/chatter-posts/mention-users` | JWT | List mentionable users |
| POST | `/chatter-posts` | JWT | Create post (multipart, up to 10 files) |
| GET | `/chatter-posts/:postId/comments` | JWT | Get comments for post |
| POST | `/chatter-posts/:postId/comments` | JWT | Add comment `{message}` |

### Scheduler Assignments (`/scheduler-assignments`)
| Method | Route | Auth | Roles | Description |
|--------|-------|------|-------|-------------|
| GET | `/scheduler-assignments` | JWT | Any | Get assignments (query: weekStart YYYY-MM-DD) |
| GET | `/scheduler-assignments/week/:weekStart/meta` | JWT | Any | Week metadata (isLocked, version) |
| PUT | `/scheduler-assignments/week/:weekStart` | JWT | HOD, ADMIN, PM | Save week snapshot (full replace) |
| POST | `/scheduler-assignments/week/:weekStart/lock` | JWT | HOD, ADMIN, PM | Lock week |
| DELETE | `/scheduler-assignments/week/:weekStart/lock` | JWT | HOD, ADMIN, PM | Unlock week |

### Regularization Requests (`/regularization-requests`) — No auth
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/regularization-requests` | List (query: designerId UUID) |
| POST | `/regularization-requests` | Create request |
| PATCH | `/regularization-requests/:id` | Update status |

### Overtime Requests (`/overtime-requests`) — No auth
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/overtime-requests` | List (query: designerId UUID) |
| POST | `/overtime-requests` | Create request |
| PATCH | `/overtime-requests/:id` | Update status + approvedHours |

### Requests/Leave (`/requests`)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/requests` | JWT | List (query: designerId) |
| POST | `/requests` | JWT | Create leave request |
| PATCH | `/requests/:id/status` | JWT | Update status (APPROVED/REJECTED/PENDING) |

### Activities (`/activities`)
| Method | Route | Auth | Roles | Description |
|--------|-------|------|-------|-------------|
| GET | `/activities` | JWT | HOD, ADMIN | Global feed (query: limit) |
| GET | `/activities/task/:taskId` | JWT | Any | Task activity (query: limit, cursor) |
| GET | `/activities/project/:projectId` | JWT | Any | Project activity (query: limit, cursor) |

### Dashboard (`/dashboard`)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/dashboard/metrics` | JWT | Metrics for current user |

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
CreateProjectDto:     { name (min 2), projectNo, category: 'Retail'|'Project', businessUnit?, description?, status: 'ACTIVE'|'COMPLETED'|'ON_HOLD', salesPerson? }
UpdateProjectDto:     All fields optional
CreateProjectFileLinkDto: { url (valid absolute URL, max 1024), fileName (1-255 chars) }
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
    projectId: UUID, projectNo, projectName (min 2), businessUnit?,
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
    attachments?: TaskAttachmentInputDto[]
  }]
}

TaskAttachmentInputDto: { fileKey: string, fileName: string, mimeType: string, size: number }

UpdateTaskDto:          { title? (min 2), description?, priority?, dueDate? }
AssignTaskDto:          { assigneeId: UUID }
UpdateTaskStatusDto:    { status: 'PENDING'|'WIP'|'COMPLETED'|'REVISION'|'APPROVED'|'ON_HOLD' }
```

### Chatter
```typescript
CreateChatterPostDto: {
  taskId?: UUID, title?, message (required),
  postType?, mentionUserId?: UUID, priority?, visibility?
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
    totalParts?: number (min 1), notes?: string
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
  startDate: ISO, endDate?: ISO, reason?
}
UpdateRequestStatusDto: { status: 'APPROVED'|'REJECTED'|'PENDING' }
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
│   └── project-task-view/[id]/
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
- **Database tables:** `ErpTS` prefix (e.g., `ErpTSUser`, `ErpTSTask`, `ErpTSProject`)
- **IDs:** UUIDs (`@default(uuid())`) throughout
- **Auto-generated codes:** `taskNo` generated server-side, `revisionCode` from `/tasks/next-revision` endpoint
- **Status enums:** UPPER_CASE for task/project status; Title Case for request status (Pending/Approved/Rejected)
- **File keys:** AWS S3 object keys stored in `fileKey`; public URL in `fileUrl`

### File Upload Pattern
```
1. Client: POST /tasks/upload-file (multipart, file field)
2. Server: Upload to S3 → return { fileKey, fileUrl, fileName, mimeType, size }
3. Client: Store fileKey/fileUrl in TaskAttachmentInputDto[]
4. Client: POST /tasks/extended with attachments[] including those keys
```
File size limits: 20MB for tasks/projects, no explicit limit for chatter (10 files max).

### Pagination Pattern
```
Query params: page=1&limit=20 (default varies by endpoint)
Response: { data: [], total, page, limit, totalPages }
```
Cursor-based pagination used for activities: `{ data: [], pageInfo: { hasMore, nextCursor } }`

### Activity Logging
- `ActivityLog` records are created automatically in task/project services on significant state changes
- Actions logged: task created, status changed, assigned, files uploaded, etc.
- Readable via `GET /activities/task/:taskId` or `/activities/project/:projectId`

### Scheduler Week Save (Optimistic Concurrency)
- `PUT /scheduler-assignments/week/:weekStart` — full snapshot replace
- `version` field prevents lost updates: backend rejects if client `version` < current `version`
- History recorded in `SchedulerAssignmentHistory` (before/after JSON)
- Week can be locked (`isLocked: true`); locked weeks reject PUT operations

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
| `create-erp-ts-activity-log.sql` | Creates ErpTSActivityLog table with FKs to User and Task |
| `create-scheduler-acid.sql` | Scheduler transactional integrity constraints |
| `ensure-erp-ts-foreign-keys.sql` | Ensures FK constraints across ERP tables |
| `fix-passwords-for-login.sql` | Password field migration |

---

*Last updated: 2026-05-21. Generated from full codebase analysis.*
