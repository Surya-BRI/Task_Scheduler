# Project Sign Type Task Issue

## Summary

When creating a project task via the **Create Task modal** (`ProjectCreateTaskModal`), selecting multiple sign type rows shows "X tasks selected" in the UI — but the backend only ever creates **one task**, regardless of how many sign types are selected.

---

## How It Currently Works

### Frontend (`frontend/src/components/ProjectCreateTaskModal.jsx`)

1. Modal opens → fetches sign types from ERP via `GET /design-list/project-sign-types?salesForceCode={opNo}`
2. Sign types are rendered in a 2-level table: **Sign Family (parent)** → **Sign Codes (children)**
3. User checks disciplines (Artwork, Technical, Location, As-Built, BIM) on any number of rows
4. `selectedCount` counts every row where any discipline is checked or hours are entered
5. UI shows **"X tasks selected"** at the bottom
6. On submit, all selected rows are collected into a `projectDetails[]` array and sent to `POST /tasks/extended`

### Backend (`backend/src/tasks/tasks.service.ts` — `createExtended`, line 475)

```
tx.task.create(...)                          ← ONE task created
  for (line of dto.projectDetails) {
    tx.projectTaskDetail.create({ taskId })  ← N detail rows, all linked to the same taskId
  }
```

The entire `projectDetails` array is stored as multiple `ErpTSProjectTaskDetail` rows under a **single** `ErpTSTask` record.

---

## The Problem

| What the UI implies | What actually happens |
|---------------------|-----------------------|
| "3 tasks selected" → 3 tasks created | "3 tasks selected" → 1 task with 3 detail rows |

Selecting 5 sign types creates **1 task** with **5 `ProjectTaskDetail` rows**, not 5 separate tasks.

---

## Decision Required

Two valid approaches:

### Option A — One task per sign type (fix backend)
Inside `createExtended`, loop `projectDetails` and call `tx.task.create` + `tx.projectTaskDetail.create` for each entry within the same transaction.

- Creates N tasks, each with its own `taskNo`, status, assignee, timer, work session
- Matches what the UI currently implies ("X tasks selected")
- Bigger change — affects task list counts, scheduler, activity log, notifications

### Option B — One task, N detail lines (fix frontend label only)
Keep the backend as-is. Change the frontend label from **"X tasks selected"** to **"X sign types selected"** (or similar) to accurately reflect the 1-task model.

- No backend change needed
- Simpler fix
- Loses granularity — one task covers all sign types, can't track/assign them individually

---

## Affected Files

| File | Role |
|------|------|
| `frontend/src/components/ProjectCreateTaskModal.jsx` | Modal UI — sign type table, selectedCount label, payload builder |
| `backend/src/tasks/tasks.service.ts` (line 475) | `createExtended` — creates 1 task + N detail rows |
| `backend/src/tasks/dto/create-extended-task.dto.ts` | DTO for `POST /tasks/extended` |
| `backend/prisma/schema.prisma` | `ErpTSTask` + `ErpTSProjectTaskDetail` models |

---

## Notes

- `selectedCount` in the modal is computed from `rowHasSelection()` which checks if any discipline checkbox is ticked or any hours are filled — it does not correspond to the number of tasks that will be created
- Each `ProjectTaskDetail` row stores: `signType`, `planCode`, `artwork/artworkHours`, `technical/technicalHours`, `location/locationHours`, `asBuilt/asBuiltHours`, `bim`, `deadline`
- The `planCode` field is shared across all selected rows (single input above the table) — under Option A, each created task would get the same planCode
