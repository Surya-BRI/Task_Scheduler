-- Add phase column to ErpTSTask for PROJECT-type task-creation batching.
-- Lets an HOD tag every task created in one Create-Task submission with a
-- release "phase" (1, 2, 3...) so the flow of a project's task creation is visible.
IF COL_LENGTH('ErpTSTask', 'phase') IS NULL
BEGIN
  ALTER TABLE ErpTSTask ADD phase INT NULL;
END;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_ErpTSTask_Project_DesignType_Phase'
    AND object_id = OBJECT_ID('ErpTSTask')
)
BEGIN
  CREATE INDEX IX_ErpTSTask_Project_DesignType_Phase
    ON ErpTSTask (projectId, designType, phase);
END;
GO

-- Backfill — idempotent (WHERE phase IS NULL means a second run touches zero rows).
-- Scoped to Project-designType only; Retail tasks never get a phase.
UPDATE ErpTSTask
SET phase = 1
WHERE UPPER(designType) = 'PROJECT'
  AND phase IS NULL;
GO
