-- Dashboard inbox read/unread markers per user.
IF NOT EXISTS (
  SELECT 1 FROM sys.tables WHERE name = 'ErpTSInboxRead' AND schema_id = SCHEMA_ID('dbo')
)
BEGIN
  CREATE TABLE [dbo].[ErpTSInboxRead] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_ErpTSInboxRead_id] DEFAULT (newid()),
    [userId] UNIQUEIDENTIFIER NOT NULL,
    [itemKey] NVARCHAR(200) NOT NULL,
    [isRead] BIT NOT NULL CONSTRAINT [DF_ErpTSInboxRead_isRead] DEFAULT (1),
    [updatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_ErpTSInboxRead_updatedAt] DEFAULT (sysutcdatetime()),
    CONSTRAINT [PK_ErpTSInboxRead] PRIMARY KEY ([id]),
    CONSTRAINT [UQ_ErpTSInboxRead_user_item] UNIQUE ([userId], [itemKey]),
    CONSTRAINT [FK_ErpTSInboxRead_user] FOREIGN KEY ([userId]) REFERENCES [dbo].[ErpTSUser]([id]) ON DELETE CASCADE
  );
  CREATE INDEX [IX_ErpTSInboxRead_userId] ON [dbo].[ErpTSInboxRead]([userId]);
END
