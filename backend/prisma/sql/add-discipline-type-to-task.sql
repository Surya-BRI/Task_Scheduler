-- Add disciplineType and signFamily columns to ErpTSTask
-- Enables one-task-per-discipline tracking for project sign type rows
IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'ErpTSTask' AND COLUMN_NAME = 'disciplineType'
)
BEGIN
  ALTER TABLE ErpTSTask ADD disciplineType NVARCHAR(50) NULL;
END

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'ErpTSTask' AND COLUMN_NAME = 'signFamily'
)
BEGIN
  ALTER TABLE ErpTSTask ADD signFamily NVARCHAR(255) NULL;
END

-- Drop old unique constraint that did not include disciplineType.
-- It blocked creating multiple discipline tasks for the same sign type + revision.
IF EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'UX_ErpTSTask_Project_RevisionScopeHash'
    AND object_id = OBJECT_ID('ErpTSTask')
)
BEGIN
  DROP INDEX UX_ErpTSTask_Project_RevisionScopeHash ON ErpTSTask;
END

-- Recreate as a unique index that includes disciplineType so each discipline
-- can have its own task row for the same project / opNo / signType / revision.
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'UX_ErpTSTask_Project_RevisionDisciplineHash'
    AND object_id = OBJECT_ID('ErpTSTask')
)
BEGIN
  CREATE UNIQUE INDEX UX_ErpTSTask_Project_RevisionDisciplineHash
    ON ErpTSTask (projectId, opNo, designType, revisionCode, signType, disciplineType)
    WHERE projectId IS NOT NULL
      AND revisionCode IS NOT NULL;
END
