-- Creates ErpTSActivityLog when missing (Team Activity feed).
IF NOT EXISTS (
  SELECT 1 FROM sys.tables WHERE name = 'ErpTSActivityLog' AND schema_id = SCHEMA_ID('dbo')
)
BEGIN
  CREATE TABLE [dbo].[ErpTSActivityLog] (
    [id] UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT [ErpTSActivityLog_pkey] PRIMARY KEY DEFAULT NEWID(),
    [action] NVARCHAR(1000) NOT NULL,
    [details] NVARCHAR(MAX) NULL,
    [userId] UNIQUEIDENTIFIER NOT NULL,
    [taskId] UNIQUEIDENTIFIER NULL,
    [createdAt] DATETIME2 NOT NULL
      CONSTRAINT [ErpTSActivityLog_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ErpTSActivityLog_userId_fkey]
      FOREIGN KEY ([userId]) REFERENCES [dbo].[ErpTSUser]([id])
      ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT [ErpTSActivityLog_taskId_fkey]
      FOREIGN KEY ([taskId]) REFERENCES [dbo].[ErpTSTask]([id])
      ON DELETE NO ACTION ON UPDATE NO ACTION
  );
END
