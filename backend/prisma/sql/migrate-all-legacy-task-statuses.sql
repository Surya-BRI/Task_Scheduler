-- One-time migration: replace all legacy task status values with the unified lifecycle vocabulary.
-- Safe to re-run (WHERE clauses target only legacy values).
-- Run after deploying code that no longer reads/writes PENDING, WIP, REVISION, COMPLETED, APPROVED.

-- ── ErpTSTask.status ──────────────────────────────────────────────────────────

-- PENDING + assignee (direct or junction) → DESIGN_PLANNED
UPDATE [dbo].[ErpTSTask]
SET    [status] = 'DESIGN_PLANNED'
WHERE  [status] = 'PENDING'
  AND  ([assigneeId] IS NOT NULL OR EXISTS (
    SELECT 1 FROM [dbo].[ErpTSTaskDesigner] td WHERE td.[taskId] = [ErpTSTask].[id]
  ));

-- Remaining PENDING → DESIGN_NEW
UPDATE [dbo].[ErpTSTask]
SET    [status] = 'DESIGN_NEW'
WHERE  [status] = 'PENDING';

UPDATE [dbo].[ErpTSTask] SET [status] = 'IN_PROGRESS'      WHERE [status] = 'WIP';
UPDATE [dbo].[ErpTSTask] SET [status] = 'REWORK'           WHERE [status] = 'REVISION';
UPDATE [dbo].[ErpTSTask] SET [status] = 'DESIGN_COMPLETED' WHERE [status] = 'COMPLETED';
UPDATE [dbo].[ErpTSTask] SET [status] = 'CLIENT_ACCEPTED'  WHERE [status] IN ('APPROVED', 'REVIEW_COMPLETED');

-- ── ErpTSTask.holdPreviousStatus ────────────────────────────────────────────

UPDATE [dbo].[ErpTSTask] SET [holdPreviousStatus] = 'DESIGN_NEW'       WHERE [holdPreviousStatus] = 'PENDING';
UPDATE [dbo].[ErpTSTask] SET [holdPreviousStatus] = 'IN_PROGRESS'      WHERE [holdPreviousStatus] = 'WIP';
UPDATE [dbo].[ErpTSTask] SET [holdPreviousStatus] = 'REWORK'           WHERE [holdPreviousStatus] = 'REVISION';
UPDATE [dbo].[ErpTSTask] SET [holdPreviousStatus] = 'DESIGN_COMPLETED' WHERE [holdPreviousStatus] = 'COMPLETED';
UPDATE [dbo].[ErpTSTask] SET [holdPreviousStatus] = 'CLIENT_ACCEPTED'  WHERE [holdPreviousStatus] IN ('APPROVED', 'REVIEW_COMPLETED');

-- Verify
SELECT [status], COUNT(*) AS cnt FROM [dbo].[ErpTSTask] GROUP BY [status] ORDER BY [status];

-- Optional: tighten CHECK constraint to unified statuses only (after verifying no legacy rows remain)
DECLARE @constraintName NVARCHAR(256);
SELECT @constraintName = cc.name
FROM sys.check_constraints cc
JOIN sys.columns col ON cc.parent_object_id = col.object_id AND cc.parent_column_id = col.column_id
WHERE OBJECT_NAME(cc.parent_object_id) = 'ErpTSTask' AND col.name = 'status';

IF @constraintName IS NOT NULL
  EXEC('ALTER TABLE ErpTSTask DROP CONSTRAINT [' + @constraintName + ']');

ALTER TABLE ErpTSTask
  ADD CONSTRAINT CK_Task_status CHECK (status IN (
    'DESIGN_NEW', 'DESIGN_PLANNED', 'IN_PROGRESS', 'DESIGN_COMPLETED',
    'HOD_REVIEW', 'SALES_REVIEW', 'REWORK',
    'CLIENT_ACCEPTED', 'CLIENT_REJECTED', 'ON_HOLD'
  ));
