IF COL_LENGTH('dbo.ErpTSChatterPost', 'projectId') IS NULL
BEGIN
  ALTER TABLE dbo.ErpTSChatterPost ADD projectId UNIQUEIDENTIFIER NULL;
END;

IF OBJECT_ID(N'[dbo].[ErpTSChatterPost]', N'U') IS NOT NULL
   AND COL_LENGTH('dbo.ErpTSChatterPost', 'projectId') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_ErpTSChatterPost_Project')
BEGIN
  ALTER TABLE [dbo].[ErpTSChatterPost] ADD CONSTRAINT [FK_ErpTSChatterPost_Project]
    FOREIGN KEY ([projectId]) REFERENCES [dbo].[ErpTSProject]([id])
    ON DELETE NO ACTION ON UPDATE NO ACTION;
END;
