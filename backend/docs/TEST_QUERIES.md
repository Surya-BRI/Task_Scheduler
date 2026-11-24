# Test Queries — MSSQL

Use these queries in SSMS or Azure Data Studio to verify task and scheduler state.

> Run them against the database `DATABASE_URL` points at — **ERP-Live** in production (read-only `SELECT`s only; never run ad-hoc writes there). Users live in the ERP-owned `ErpAuthUsers` table (`userId` bigint, `userName`); the old `ErpTSUser` / `fullName` no longer exist, so user ids below are bigints, not GUIDs.
>
> Column names checked against `backend/prisma/schema.prisma` (2026-11-24). Task statuses use the unified vocabulary: `DESIGN_NEW`, `DESIGN_PLANNED`, `IN_PROGRESS`, `DESIGN_COMPLETED`, `HOD_REVIEW`, `SALES_REVIEW`, `REWORK`, `CLIENT_ACCEPTED`, `CLIENT_REJECTED`, `ON_HOLD`.

---

## Task Status

**Check a specific task's current status:**
```sql
SELECT id, taskNo, title, status, holdPreviousStatus, assigneeId, updatedAt
FROM ErpTSTask
WHERE id = '<task-id>'
```

**All ON_HOLD tasks:**
```sql
SELECT id, taskNo, title, status, holdPreviousStatus, assigneeId, updatedAt
FROM ErpTSTask
WHERE status = 'ON_HOLD'
ORDER BY updatedAt DESC
```

**Unassigned new tasks (no designer, not yet planned):**
```sql
SELECT t.id, t.taskNo, t.title, t.status, t.updatedAt
FROM ErpTSTask t
WHERE t.status = 'DESIGN_NEW'
  AND t.assigneeId IS NULL
  AND NOT EXISTS (SELECT 1 FROM ErpTSTaskDesigner td WHERE td.taskId = t.id)
ORDER BY t.updatedAt DESC
```

---

## Scheduler Assignments

**Check if a task is currently assigned in the scheduler:**
```sql
SELECT id, designerId, weekStartDate, dayIndex, assignedHours, splitIndex, totalParts, isLocked, isPinned, createdAt
FROM ErpTSSchedulerAssignment
WHERE taskId = '<task-id>'
ORDER BY weekStartDate, dayIndex, position
```

**All assignments for a given week:**
```sql
SELECT sa.*, u.userName AS designerName
FROM ErpTSSchedulerAssignment sa
JOIN ErpAuthUsers u ON u.userId = sa.designerId
WHERE sa.weekStartDate = '2026-05-25'   -- YYYY-MM-DD Monday
ORDER BY u.userName, sa.dayIndex, sa.position
```

**Week lock / version state:**
```sql
SELECT weekStartDate, version, isLocked, updatedBy, updatedAt
FROM ErpTSSchedulerWeek
WHERE weekStartDate = '2026-05-25'
```

**Scheduler assignment history for a week (before/after JSON snapshots):**
History rows are per **week save**, not per task — filter by week, then search the JSON for a task id if needed.
```sql
SELECT id, versionFrom, versionTo, changedBy, createdAt
FROM ErpTSSchedulerAssignmentHistory
WHERE weekStartDate = '2026-05-25'
  -- AND afterJson LIKE '%<task-id>%'
ORDER BY createdAt DESC
```

**Weekend day-locks (row present = locked):**
```sql
SELECT dl.date, u.userName, dl.reason, dl.createdAt
FROM ErpTSSchedulerDayUnlock dl
JOIN ErpAuthUsers u ON u.userId = dl.designerId
ORDER BY dl.date DESC
```

---

## Activity Log

**Full audit trail for a task:**
```sql
SELECT userId, action, details, createdAt
FROM ErpTSActivityLog
WHERE taskId = '<task-id>'
ORDER BY createdAt DESC
```

**Recent activity across all tasks (last 50):**
```sql
SELECT TOP 50 al.action, al.details, al.createdAt, u.userName AS actor
FROM ErpTSActivityLog al
LEFT JOIN ErpAuthUsers u ON u.userId = al.userId
ORDER BY al.createdAt DESC
```

**Last nightly carryover runs:**
```sql
SELECT TOP 10 createdAt, details
FROM ErpTSActivityLog
WHERE action = 'SCHEDULER_CARRYOVER'
ORDER BY createdAt DESC
```

---

## Project Team

**Team assignment for a specific project (by projectNo):**
```sql
SELECT id, projectNo, name, technicalHead, teamLead, subTeamLead, designers, updatedAt
FROM ErpTSProject
WHERE projectNo = '<project-no>'
```

**Team assignment by project UUID:**
```sql
SELECT id, projectNo, name, technicalHead, teamLead, subTeamLead, designers, updatedAt
FROM ErpTSProject
WHERE id = '<project-id>'
```

**Projects with an incomplete team** (a project with *no* team at all is unrestricted — see `SCHEDULER_RULES.md` Rule 10):
```sql
SELECT id, projectNo, name, technicalHead, teamLead, subTeamLead, designers
FROM ErpTSProject
WHERE technicalHead IS NULL OR teamLead IS NULL OR subTeamLead IS NULL OR designers IS NULL
ORDER BY updatedAt DESC
```

**Recently saved team assignments:**
```sql
SELECT TOP 20 id, projectNo, name, technicalHead, teamLead, subTeamLead, designers, updatedAt
FROM ErpTSProject
WHERE technicalHead IS NOT NULL OR teamLead IS NOT NULL OR subTeamLead IS NOT NULL OR designers IS NOT NULL
ORDER BY updatedAt DESC
```

---

## Designer Workload

**All tasks currently assigned to a designer** (single-designer via `assigneeId`, split tasks via `ErpTSTaskDesigner`):
```sql
SELECT t.id, t.taskNo, t.title, t.status, t.updatedAt
FROM ErpTSTask t
WHERE t.assigneeId = <designer-id>
   OR EXISTS (SELECT 1 FROM ErpTSTaskDesigner td WHERE td.taskId = t.id AND td.designerId = <designer-id>)
ORDER BY t.updatedAt DESC
```

**Scheduler hours per designer for a week:**
```sql
SELECT u.userName, sa.dayIndex, SUM(sa.assignedHours) AS totalHours
FROM ErpTSSchedulerAssignment sa
JOIN ErpAuthUsers u ON u.userId = sa.designerId
WHERE sa.weekStartDate = '2026-05-25'
GROUP BY u.userName, sa.dayIndex
ORDER BY u.userName, sa.dayIndex
```

---

> Replace `<task-id>` with the actual UUID (e.g. `'a1b2c3d4-...'`) and `<designer-id>` with the ERP bigint `userId`.
> All timestamps are UTC — add `AT TIME ZONE` conversion if your SSMS is set to local time.
