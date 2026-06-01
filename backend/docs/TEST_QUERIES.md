# Test Queries — MSSQL

Use these queries in SSMS or Azure Data Studio to verify task and scheduler state.

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
SELECT sa.*, u.fullName AS designerName
FROM ErpTSSchedulerAssignment sa
JOIN ErpTSUser u ON u.id = sa.designerId
WHERE sa.weekStart = '2026-05-25'   -- YYYY-MM-DD Monday
ORDER BY u.fullName, sa.dayIndex
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
SELECT TOP 50 al.action, al.details, al.createdAt, u.fullName AS actor
FROM ErpTSActivityLog al
LEFT JOIN ErpTSUser u ON u.id = al.userId
ORDER BY al.createdAt DESC
```

---

## Designer Workload

**All tasks currently assigned to a designer:**
```sql
SELECT t.id, t.taskNo, t.title, t.status, t.updatedAt
FROM ErpTSTask t
JOIN ErpTSUser u ON u.id = t.assigneeId
WHERE u.fullName = 'Alex Johnson'   -- or use u.id = '<designer-id>'
ORDER BY t.updatedAt DESC
```

**Scheduler hours per designer for a week:**
```sql
SELECT u.fullName, sa.dayIndex, SUM(sa.assignedHours) AS totalHours
FROM ErpTSSchedulerAssignment sa
JOIN ErpTSUser u ON u.id = sa.designerId
WHERE sa.weekStart = '2026-05-25'
GROUP BY u.fullName, sa.dayIndex
ORDER BY u.fullName, sa.dayIndex
```

---

> Replace `<task-id>` with the actual UUID (e.g. `'a1b2c3d4-...'`).
> All timestamps are UTC — add `AT TIME ZONE` conversion if your SSMS is set to local time.
