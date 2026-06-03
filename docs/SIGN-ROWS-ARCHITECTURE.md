# Project Sign Rows — Architecture & Pending Work

> Reference doc for the two separate sign-row data models in the project task flow.
> Written: 2026-06-03. Fix when ready.

---

## The Two Models

### 1. `ProjectTaskDetail` (`ErpTSProjectTaskDetail`)
**What it is:** Design work specification per sign type — how many hours of artwork, technical, location, as-built, BIM work is needed.

**Created by:** `POST /tasks/extended` (the Create Task modal)

**Fields:**
```
signType, planCode, area, level,
artwork (bool), artworkHours,
technical (bool), technicalHours,
location (bool), locationHours,
asBuilt (bool), asBuiltHours,
bim (bool), deadline, comment
```

**Status:** Working. Modal correctly posts these rows.

---

### 2. `ProjectSignRow` (`ErpTSProjectSignRow`)
**What it is:** ERP sign register — a flat list of every physical sign in the project with quantities, area, level, status. Imported from ERP/project specs.

**Managed by:**
| Endpoint | Purpose |
|----------|---------|
| `GET /tasks/:id/sign-rows` | Fetch the sign register for a task |
| `PUT /tasks/:id/sign-rows` | Save / full-replace the sign register |

**Fields:**
```
tNo, no, signType, planCode,
estQty, qsQty,
areaZone, levelParcel,
sequence, status, comment, contRef
```

**Status:** Backend endpoints exist and work. No frontend UI built yet.

---

## Current Problem — Hardcoded Sign Types in Creation Modal

**File:** `frontend/src/components/ProjectCreateTaskModal.jsx`

The `SIGN_TYPE_ROWS` constant at the top of the file is **completely static/hardcoded** (B315–B323 with children like CP-4-210, CP-4-211). These sign types are dummy placeholder data — they do not come from the ERP or any database.

```js
// THIS IS FAKE DATA — needs to be replaced
const SIGN_TYPE_ROWS = [
  { id: 'b315', signType: 'B315', children: [ ... ] },
  { id: 'b316', signType: 'B316', children: [ ... ] },
  ...
]
```

**What it should do instead:** Fetch the real sign types from the ERP using the `record` prop (which has `opNo` and `projectNo`). The real data lives in `ErpTSSignageDetail` (linked to `ErpTSDesignTask`), which has `signFamily`, `signType`, `planCode`.

---

## What Needs to Be Built

### Fix 1 — Dynamic sign types in creation modal (medium effort)

**Goal:** Replace hardcoded `SIGN_TYPE_ROWS` with data fetched from the ERP.

**How:**
1. When the modal opens, call the design list / ERP endpoint using `record.opNo` + `record.projectNo`
2. Map the returned `signageDetails` (from `ErpTSSignageDetail`) into the row format the table expects
3. Group children by `signFamily` (parent) → `signType` (child)
4. Show a loading state while fetching; fall back to empty table if no data

**Relevant data source:**
- ERP table: `ErpTSSignageDetail` → fields: `signFamily`, `signType`, `planCode`, `contractRef`, `quantity`
- Linked via: `ErpTSDesignTask.signageDetails`

---

### Fix 2 — Sign register UI on task detail page (larger effort)

**Goal:** After a task is created, let HOD/PM view, import, and edit the `ProjectSignRow` register.

**Where:** Task detail page (`frontend/src/views/TaskDetailsPage.jsx`) — add a new "Sign Register" tab or section.

**Behaviour:**
- `GET /tasks/:id/sign-rows` → load existing rows into an editable table
- Editable columns: `tNo`, `no`, `signType`, `planCode`, `estQty`, `qsQty`, `areaZone`, `levelParcel`, `sequence`, `status`, `comment`, `contRef`
- "Save" button → `PUT /tasks/:id/sign-rows` with the full updated rows array
- Optional: "Import from Excel" button to bulk-paste rows

**Auth required:** HOD, ADMIN, PROJECT_MANAGER (matches backend `@Roles` on the endpoint)

---

## Data Flow Summary

```
ERP DesignTask
  └── ErpTSSignageDetail  (signFamily, signType, planCode, qty)
          │
          │  [Fix 1] Load into creation modal sign type list
          ▼
  ProjectCreateTaskModal
          │
          │  POST /tasks/extended
          ▼
  ErpTSTask (Task created)
  ErpTSProjectTaskDetail  ← artwork/technical/BIM hours per sign type
  ErpTSProjectSignRow     ← [Fix 2] sign register, managed separately after creation
          │
          │  PUT /tasks/:id/sign-rows
          ▼
  Task Detail Page — Sign Register tab
```

---

## Files to Touch When Fixing

| Fix | File |
|-----|------|
| Fix 1 | `frontend/src/components/ProjectCreateTaskModal.jsx` — replace `SIGN_TYPE_ROWS` constant, add fetch on open |
| Fix 1 | `backend/src/design-list/design-list.controller.ts` — may need a new endpoint to serve signage details by opNo |
| Fix 2 | `frontend/src/views/TaskDetailsPage.jsx` — add Sign Register section |
| Fix 2 | New API service file: `frontend/src/features/projects/services/sign-rows.api.ts` |

---

## Backend Endpoints Reference

```
GET  /tasks/:id/sign-rows           → ProjectSignRow[]
PUT  /tasks/:id/sign-rows           → { rows: ProjectSignRowDto[] } → ProjectSignRow[]
POST /tasks/extended                → creates Task + ProjectTaskDetail[]
```

`ProjectSignRowDto` shape (from `backend/src/tasks/dto/save-sign-rows.dto.ts`):
```typescript
{
  tNo?: string
  no?: string
  signType?: string
  planCode?: string
  estQty?: number
  qsQty?: number
  areaZone?: string
  levelParcel?: string
  sequence?: string
  status?: string
  comment?: string
  contRef?: string
}
```
