-- Widen rework/reject reference URL columns so S3 object URLs fit.
IF COL_LENGTH('dbo.ErpTSTask', 'reworkAttachmentUrl') IS NOT NULL
BEGIN
  ALTER TABLE dbo.ErpTSTask ALTER COLUMN reworkAttachmentUrl NVARCHAR(2000) NULL;
END;

IF COL_LENGTH('dbo.ErpTSTask', 'reworkLinkUrl') IS NOT NULL
BEGIN
  ALTER TABLE dbo.ErpTSTask ALTER COLUMN reworkLinkUrl NVARCHAR(2000) NULL;
END;
