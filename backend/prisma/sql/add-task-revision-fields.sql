IF COL_LENGTH('ErpTSTask', 'revisionCode') IS NULL
BEGIN
  ALTER TABLE ErpTSTask ADD revisionCode NVARCHAR(20) NULL;
END;

IF COL_LENGTH('ErpTSTask', 'designType') IS NULL
BEGIN
  ALTER TABLE ErpTSTask ADD designType NVARCHAR(80) NULL;
END;

IF EXISTS (
  SELECT 1
  FROM sys.columns
  WHERE object_id = OBJECT_ID('ErpTSTask')
    AND name = 'title'
    AND is_nullable = 0
)
BEGIN
  ALTER TABLE ErpTSTask ALTER COLUMN title NVARCHAR(200) NULL;
END;

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'IX_ErpTSTask_Project_OpNo_DesignType_RevisionCode'
    AND object_id = OBJECT_ID('ErpTSTask')
)
BEGIN
  CREATE INDEX IX_ErpTSTask_Project_OpNo_DesignType_RevisionCode
    ON ErpTSTask (projectId, opNo, designType, revisionCode);
END;
