# Activity Log Coverage

What is recorded in `ErpTSActivityLog`. The source of truth for action names is `backend/src/activities/activity-events.ts` (`ActivityAction`); rows are written through `ActivityLoggerService` (and directly by the deadline-alerts cron).

_Last synced with code: 2026-11-24._

## Recorded

### Tasks
| Action | Triggered by |
|---|---|
| `TASK_CREATED` | `POST /tasks`, `POST /tasks/extended` |
| `ASSIGNED_TASK` | `PATCH /tasks/:id/assign` |
| `STATUS_CHANGED` | `PATCH /tasks/:id/status` |
| `TASK_COMPLETED`, `CLIENT_APPROVED`, `CLIENT_REJECTED_TASK` | status transitions in `tasks.service.ts` |
| `TASK_FILE_UPLOADED` | `POST /tasks/upload-file` |
| `TASK_WORK_SUBMITTED` | `POST /tasks/:id/submit-work` |
| `DEADLINE_REMINDER`, `DEADLINE_OVERDUE` | deadline-alerts cron (every 5 min) |

### Projects / QS
| Action | Triggered by |
|---|---|
| `PROJECT_FILE_UPLOADED` / `PROJECT_FILE_DELETED` | `POST /projects/:id/files`, `DELETE /projects/:id/files/:fileId` |
| `QS_PROJECT_ASSIGNED`, `SIGN_FAMILY_UPDATED`, `QS_STATUS_CHANGED`, `QS_UPDATE_SUBMITTED` | QS assignment / sign-family / status / submit paths in `projects.service.ts` (and `tasks.service.ts` for QS assignment) |

`QS_SIGN_ROW_ADDED/UPDATED/DELETED` are defined in `activity-events.ts` but nothing writes them yet.

### Scheduler
| Action | Triggered by |
|---|---|
| `SCHEDULER_WEEK_SAVED` | `PUT /scheduler-assignments/week/:weekStart` |
| `SCHEDULER_WEEK_LOCKED` / `SCHEDULER_WEEK_UNLOCKED` | `POST` / `DELETE /scheduler-assignments/week/:weekStart/lock` |
| `SCHEDULER_LEAVE_RESCHEDULED` | leave approval → `rescheduleForApprovedLeave` |
| `SCHEDULER_CARRYOVER` | nightly carryover cron or `POST /scheduler-carryover/trigger` (also read by `GET /scheduler-carryover/last-run`) |

### Requests
| Area | Actions |
|---|---|
| Leave | `LEAVE_REQUEST_SUBMITTED`, `LEAVE_REQUEST_UPDATED`, `LEAVE_REQUEST_CANCELLED`, `LEAVE_REQUEST_REVOKED`, `LEAVE_REQUEST_STATUS_CHANGED`, `LEAVE_AUTO_APPROVED` |
| Regularization | `REGULARIZATION_SUBMITTED`, `REGULARIZATION_APPROVED`, `REGULARIZATION_REJECTED`, `REGULARIZATION_STATUS_CHANGED`, `REGULARIZATION_AUTO_APPROVED` |
| Overtime | `OVERTIME_REQUEST_SUBMITTED`, `OVERTIME_REQUEST_UPDATED`, `OVERTIME_REQUEST_APPROVED`, `OVERTIME_REQUEST_REJECTED`, `OVERTIME_REQUEST_WITHDRAWN`, `OVERTIME_REQUEST_STATUS_CHANGED`, `OVERTIME_AUTO_APPROVED` |
| Reallocation | `REALLOCATION_REQUEST_SUBMITTED`, `REALLOCATION_REQUEST_APPROVED`, `REALLOCATION_REQUEST_REJECTED`, `REALLOCATION_REQUEST_CANCELLED` |

Overtime, regularization and reallocation actions are **excluded from project/task history timelines** (`PROJECT_HISTORY_EXCLUDED_ACTIONS`); they still appear in the team feed.

### Chatter
| Action | Triggered by |
|---|---|
| `CREATED_CHATTER_POST` | `POST /chatter-posts` |
| `CREATED_CHATTER_COMMENT` | `POST /chatter-posts/:postId/comments` |
| `CHATTER_MENTION` | defined and rendered by the feed (`activities.service.ts`) |

## Not recorded

- Chatter likes / seen / edits / deletes
- Chat (conversation) messages
- Dashboard view/open tracking
- UI-only actions that do not call backend mutation endpoints

## Notes

- No separate activity table — `ErpTSActivityLog` is reused.
- Structured JSON (`event`, `messageKey`, task/project snapshots) is stored in `details`.
- Project-level and request events may have `taskId = NULL` by design.
- Background jobs (carryover, deadline alerts) log with the first HOD/Admin user as the actor.
