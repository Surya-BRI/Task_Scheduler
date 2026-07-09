-- Track when a draft timer run began so elapsed time can be computed server-side
-- (scheduler handoff, week load) even if the designer never paused.

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('ErpTSTaskWorkSession') AND name = 'runStartedAt'
)
BEGIN
  ALTER TABLE ErpTSTaskWorkSession
    ADD runStartedAt DATETIME2 NULL;
END
GO
