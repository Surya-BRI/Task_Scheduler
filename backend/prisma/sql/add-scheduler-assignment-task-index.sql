-- The cross-week split-index recompute in saveWeekSnapshot filters by
-- taskId (IN) + weekStartDate (NOT EQUAL). Neither existing composite index
-- (both leading with weekStartDate) can serve that pattern efficiently, so
-- this query scans a growing share of the table as more weeks accumulate.
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_ErpTSSchedulerAssignment_task_week'
    AND object_id = OBJECT_ID('dbo.ErpTSSchedulerAssignment')
)
BEGIN
  CREATE INDEX [IX_ErpTSSchedulerAssignment_task_week]
    ON [dbo].[ErpTSSchedulerAssignment] ([taskId], [weekStartDate]);
END;
