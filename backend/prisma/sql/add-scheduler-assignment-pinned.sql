IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.ErpTSSchedulerAssignment')
    AND name = 'isPinned'
)
BEGIN
  ALTER TABLE [dbo].[ErpTSSchedulerAssignment]
    ADD [isPinned] BIT NOT NULL DEFAULT 0;
END;
