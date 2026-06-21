-- Add holdPreviousStatus column to ErpTSTask
-- Stores the task status before it was put ON_HOLD so it can be restored on resume.

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('ErpTSTask') AND name = 'holdPreviousStatus'
)
BEGIN
  ALTER TABLE ErpTSTask
    ADD holdPreviousStatus NVARCHAR(50) NULL;
END
