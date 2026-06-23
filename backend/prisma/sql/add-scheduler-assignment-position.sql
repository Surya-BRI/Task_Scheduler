IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.ErpTSSchedulerAssignment')
    AND name = 'position'
)
BEGIN
  ALTER TABLE [dbo].[ErpTSSchedulerAssignment]
    ADD [position] INT NOT NULL DEFAULT 0;
END;

-- Backfill: assign stable positions to existing rows so they don't all sit at 0.
-- Uses the same id ASC order the old query used, so the visible order on first
-- load after migration matches what users saw before (no unexpected reordering).
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY designerId, weekStartDate, dayIndex
      ORDER BY id ASC
    ) - 1 AS pos
  FROM [dbo].[ErpTSSchedulerAssignment]
  WHERE position = 0
)
UPDATE sa
  SET sa.position = ranked.pos
FROM [dbo].[ErpTSSchedulerAssignment] sa
JOIN ranked ON ranked.id = sa.id;
