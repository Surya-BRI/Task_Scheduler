-- Speeds up the daily SchedulerAssignmentHistory retention purge
-- (DELETE WHERE createdAt < cutoff).
IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = N'IX_ErpTSSchedulerAssignmentHistory_createdAt'
    AND object_id = OBJECT_ID(N'dbo.ErpTSSchedulerAssignmentHistory')
)
BEGIN
  CREATE NONCLUSTERED INDEX [IX_ErpTSSchedulerAssignmentHistory_createdAt]
    ON [dbo].[ErpTSSchedulerAssignmentHistory] ([createdAt]);
END
GO
