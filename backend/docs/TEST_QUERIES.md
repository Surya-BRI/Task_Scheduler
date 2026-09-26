# Test Queries — MSSQL

Use these queries in SSMS or Azure Data Studio to verify task and scheduler state.

> Run them against the database `DATABASE_URL` points at — **ERP-Live** in production (read-only `SELECT`s only; never run ad-hoc writes there). Users live in the ERP-owned `ErpAuthUsers` table (`userId` bigint, `userName`); the old `ErpTSUser` / `fullName` no longer exist, so user ids below are bigints, not GUIDs.

---

## Task Status

**Check a specific task's current status:**
```sql
SELECT id, taskNo, title, status, assigneeId, updatedAt
FROM ErpTSTask
WHERE id = '<task-id>'
```

**All ON_HOLD tasks:**
```sql
SELECT id, taskNo, title, status, assigneeId, updatedAt
FROM ErpTSTask
WHERE status = 'ON_HOLD'
ORDER BY updatedAt DESC
```

**Unassigned tasks (no designer, pending):**
```sql
SELECT id, taskNo, title, status, assigneeId, updatedAt
FROM ErpTSTask
WHERE status = 'PENDING' AND assigneeId IS NULL
ORDER BY updatedAt DESC
```

---

## Scheduler Assignments

**Check if a task is currently assigned in the scheduler:**
```sql
SELECT *
FROM ErpTSSchedulerAssignment
WHERE taskId = '<task-id>'
ORDER BY createdAt DESC
```

**All assignments for a given week:**
```sql
SELECT sa.*, u.userName AS designerName
FROM ErpTSSchedulerAssignment sa
JOIN ErpAuthUsers u ON u.userId = sa.designerId
WHERE sa.weekStart = '2026-05-25'   -- YYYY-MM-DD Monday
ORDER BY u.userName, sa.dayIndex
```

**Check scheduler assignment history (before/after snapshots):**
```sql
SELECT *
FROM ErpTSSchedulerAssignmentHistory
WHERE taskId = '<task-id>'
ORDER BY changedAt DESC
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

**Projects still missing a full team (blocked from creating tasks):**
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

**All tasks currently assigned to a designer:**
```sql
SELECT t.id, t.taskNo, t.title, t.status, t.updatedAt
FROM ErpTSTask t
JOIN ErpAuthUsers u ON u.userId = t.assigneeId
WHERE u.userName = '<user-name>'   -- or use u.userId = <designer-id>
ORDER BY t.updatedAt DESC
```

**Scheduler hours per designer for a week:**
```sql
SELECT u.userName, sa.dayIndex, SUM(sa.assignedHours) AS totalHours
FROM ErpTSSchedulerAssignment sa
JOIN ErpAuthUsers u ON u.userId = sa.designerId
WHERE sa.weekStart = '2026-05-25'
GROUP BY u.userName, sa.dayIndex
ORDER BY u.userName, sa.dayIndex
```

---

> Replace `<task-id>` with the actual UUID (e.g. `'a1b2c3d4-...'`).
> All timestamps are UTC — add `AT TIME ZONE` conversion if your SSMS is set to local time.
