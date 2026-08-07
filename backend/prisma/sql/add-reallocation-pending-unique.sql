-- One Pending reallocation request per (taskId, requesterId).
-- Closes the double-submit race where two concurrent creates both pass the
-- app-level findFirst guard. Safe to run multiple times.
-- Run with: npx prisma db execute --file prisma/sql/add-reallocation-pending-unique.sql --schema prisma/schema.prisma

IF OBJECT_ID(N'dbo.ErpTSReallocationRequest', N'U') IS NULL
BEGIN
  RAISERROR('ErpTSReallocationRequest does not exist — run create-reallocation-request.sql first.', 16, 1);
  RETURN;
END
GO

-- Keep the oldest Pending; cancel extras so the unique index can be created.
;WITH dups AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY taskId, requesterId
      ORDER BY createdAt ASC, id ASC
    ) AS rn
  FROM dbo.ErpTSReallocationRequest
  WHERE status = N'Pending'
)
UPDATE dbo.ErpTSReallocationRequest
SET
  status = N'Cancelled',
  approverRemarks = COALESCE(
    approverRemarks,
    N'Auto-cancelled duplicate pending (unique index migration)'
  ),
  updatedAt = SYSUTCDATETIME()
WHERE id IN (SELECT id FROM dups WHERE rn > 1);
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = N'UQ_ErpTSReallocationRequest_pending_task_requester'
    AND object_id = OBJECT_ID(N'dbo.ErpTSReallocationRequest')
)
BEGIN
  CREATE UNIQUE INDEX UQ_ErpTSReallocationRequest_pending_task_requester
    ON dbo.ErpTSReallocationRequest (taskId, requesterId)
    WHERE status = N'Pending';
END
GO
