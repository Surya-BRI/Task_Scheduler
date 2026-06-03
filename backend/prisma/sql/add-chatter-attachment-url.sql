IF COL_LENGTH('dbo.ErpTSChatterPostAttachment', 'fileUrl') IS NULL
BEGIN
  ALTER TABLE dbo.ErpTSChatterPostAttachment
  ADD fileUrl NVARCHAR(2000) NULL;
END
GO
