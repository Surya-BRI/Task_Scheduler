# Activity Log Coverage

This document defines what is currently recorded in `ErpTSActivityLog` and what is not included yet.

## Included In Current Rollout

These events are recorded by the current backend implementation:

- `TASK_CREATED`
  - Triggered when a task is created through:
  - `POST /tasks`
  - `POST /tasks/extended`

- `ASSIGNED_TASK`
  - Triggered by:
  - `PATCH /tasks/:id/assign`

- `STATUS_CHANGED`
  - Triggered by:
  - `PATCH /tasks/:id/status`

- `TASK_FILE_UPLOADED`
  - Triggered by:
  - `POST /tasks/upload-file`

- `PROJECT_FILE_UPLOADED`
  - Triggered by:
  - `POST /projects/:id/files`

- `PROJECT_FILE_DELETED`
  - Triggered by:
  - `DELETE /projects/:id/files/:fileId`

- `CREATED_CHATTER_POST`
  - Triggered by:
  - `POST /chatter-posts`

- `CREATED_CHATTER_COMMENT`
  - Triggered by:
  - `POST /chatter-posts/:postId/comments`

- `TASK_WORK_SUBMITTED`
  - Triggered by:
  - `POST /tasks/:id/submit-work`

- `SCHEDULER_WEEK_SAVED`
  - Triggered by: `PUT /scheduler-assignments/week/:weekStart`

- `SCHEDULER_WEEK_LOCKED`
  - Triggered by: `POST /scheduler-assignments/week/:weekStart/lock`

- `SCHEDULER_WEEK_UNLOCKED`
  - Triggered by: `DELETE /scheduler-assignments/week/:weekStart/lock`

## Not Included Yet

The following are not covered by this rollout (unless already logged by older custom logic):

- Chatter reactions / likes / edits / deletes
- Leave request lifecycle events
- Overtime request lifecycle events
- Regularization request lifecycle events
- Dashboard view/open tracking
- UI-only actions that do not call backend mutation endpoints

## Notes

- No new activity table was added. Existing `ErpTSActivityLog` is reused.
- Structured JSON is stored in `details` for new events.
- Some project-level events may have `taskId = NULL` by design.
