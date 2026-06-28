IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.ErpTSProjectSignRow') AND name = 'signFamily'
)
  ALTER TABLE [dbo].[ErpTSProjectSignRow] ADD [signFamily] NVARCHAR(255) NULL;
