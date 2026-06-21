-- One-time migration: promote legacy PENDING/WIP rows to the current status vocabulary.
--
-- PENDING was the original status for unassigned/new tasks.
-- WIP was the original in-progress status.
-- After the new design lifecycle statuses were introduced:
--   PENDING + no assignee  → DESIGN_NEW
--   PENDING + assignee     → DESIGN_PLANNED
--   WIP                    → IN_PROGRESS
--
-- Run this script once against the database after deploying the new backend.
-- Safe to re-run (WHERE clauses are idempotent).

-- 1. PENDING tasks WITH a direct assigneeId → DESIGN_PLANNED
UPDATE [dbo].[ErpTSTask]
SET    [status] = 'DESIGN_PLANNED'
WHERE  [status] = 'PENDING'
  AND  [assigneeId] IS NOT NULL;

-- 2. PENDING tasks with NO direct assigneeId but present in ErpTSTaskDesigner junction → DESIGN_PLANNED
--    (split tasks where assigneeId is null but designers exist in junction table)
UPDATE t
SET    t.[status] = 'DESIGN_PLANNED'
FROM   [dbo].[ErpTSTask] t
WHERE  t.[status] = 'PENDING'
  AND  t.[assigneeId] IS NULL
  AND  EXISTS (
    SELECT 1
    FROM   [dbo].[ErpTSTaskDesigner] td
    WHERE  td.[taskId] = t.[id]
  );

-- 3. Remaining PENDING tasks with no assignee at all → DESIGN_NEW
UPDATE [dbo].[ErpTSTask]
SET    [status] = 'DESIGN_NEW'
WHERE  [status] = 'PENDING';

-- 4. WIP → IN_PROGRESS
UPDATE [dbo].[ErpTSTask]
SET    [status] = 'IN_PROGRESS'
WHERE  [status] = 'WIP';

-- Verify
SELECT [status], COUNT(*) AS cnt
FROM   [dbo].[ErpTSTask]
GROUP  BY [status]
ORDER  BY [status];
