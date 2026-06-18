# Project Sign Type Task Issue — RESOLVED

**Resolution:** Option A was implemented. One task is created per discipline per sign type.

---

## What Was the Problem

When creating a project task via the **Create Task modal** (`ProjectCreateTaskModal`), selecting multiple sign type rows and ticking discipline checkboxes (Artwork, Technical, etc.) implied that multiple tasks would be created — but the backend previously created **one task** for each sign type row regardless of how many disciplines were checked.

---

## What Changed

### Frontend (`frontend/src/components/ProjectCreateTaskModal.jsx`)

- The payload builder now emits **one `projectDetails` entry per ticked discipline per sign type** (not one per sign type row).
- Each entry carries `signFamily` (the parent sign family label), `signType` (the child sign code), and `disciplineType` (e.g. `"Artwork"`, `"Technical"`, etc.).
- `selectedCount` now counts individual discipline checkbox ticks — each tick = one task that will be created.
- Deadline is now required if any discipline is checked on a row (red border + `toast.error()`).

### Backend (`backend/src/tasks/tasks.service.ts` — `createExtended`)

- Loops `projectDetails` and creates **one `ErpTSTask` per entry**, each with its own `taskNo`, `signFamily`, `disciplineType`, and `revisionCode`.
- Task title is built as `[opNo, signType, disciplineType, revisionCode].join(' - ')`.
- Duplicate check now includes `disciplineType` — you can have Artwork + Technical tasks for the same sign type + revision.
- `dueDate` is set from `line.deadline` first, then falls back to `dto.task.dueDate`.

### Schema (`backend/prisma/schema.prisma`)

- Added `signFamily String?` and `disciplineType String?` fields to `Task`.
- Composite index updated to include `disciplineType`.

### SQL Migration (`backend/prisma/sql/add-discipline-type-to-task.sql`)

- Adds `disciplineType NVARCHAR(50)` and `signFamily NVARCHAR(255)` columns to `ErpTSTask`.
- Drops old unique index `UX_ErpTSTask_Project_RevisionScopeHash`.
- Recreates as `UX_ErpTSTask_Project_RevisionDisciplineHash` (includes `disciplineType`) so multiple discipline tasks can coexist for the same project/opNo/signType/revision.

### Task Display

- `task-view-model.js` — `mapTaskToDesignRow` builds `name` as `[opNo, signType, disciplineType, revisionCode].join(' - ')`.
- `DesignSchedulerScreen.jsx` — scheduler task cards now show a color-coded discipline chip alongside the design-type chip.
- `TaskDetailsPage.jsx` — project task list has a **Sign Family** column; task row shows sign type as subtitle under task no; discipline shown as color-coded pill. Work scope section shows the active discipline pill + hours instead of all five checkboxes.
- `ProjectTaskTimer.jsx` — added `onStatusChange` prop; task detail page refreshes after timer moves task to `IN_PROGRESS`.

---

## Affected Files

| File | Change |
|------|--------|
| `frontend/src/components/ProjectCreateTaskModal.jsx` | One entry per discipline per sign type; deadline required; toast validation |
| `backend/src/tasks/tasks.service.ts` | One task per detail entry; title includes discipline; duplicate check includes discipline |
| `backend/src/tasks/dto/create-extended-task.dto.ts` | Added `signFamily?` and `disciplineType?` to `ProjectDetailInputDto` |
| `backend/prisma/schema.prisma` | Added `signFamily`, `disciplineType` to Task; updated composite index |
| `backend/prisma/sql/add-discipline-type-to-task.sql` | SQL migration for new columns and index |
| `frontend/src/features/design-list/task-view-model.js` | Name built from opNo + signType + disciplineType + revisionCode |
| `frontend/src/features/scheduler/components/DesignSchedulerScreen.jsx` | Discipline chip on scheduler cards |
| `frontend/src/views/TaskDetailsPage.jsx` | Sign Family column, discipline pill, work scope redesign |
| `frontend/src/components/ProjectTaskTimer.jsx` | `onStatusChange` prop triggers task refresh |
