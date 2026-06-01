-- Creates ErpTSConversation, ErpTSConversationParticipant, and ErpTSMessage when missing.

-- 1. Conversation Table
IF NOT EXISTS (
  SELECT 1 FROM sys.tables WHERE name = 'ErpTSConversation' AND schema_id = SCHEMA_ID('dbo')
)
BEGIN
  CREATE TABLE [dbo].[ErpTSConversation] (
    [id] UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT [ErpTSConversation_pkey] PRIMARY KEY DEFAULT NEWID(),
    [name] NVARCHAR(255) NULL,
    [isGroup] BIT NOT NULL CONSTRAINT [ErpTSConversation_isGroup_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpTSConversation_createdAt_df] DEFAULT SYSUTCDATETIME(),
    [updatedAt] DATETIME2 NOT NULL CONSTRAINT [ErpTSConversation_updatedAt_df] DEFAULT SYSUTCDATETIME()
  );
END

-- 2. ConversationParticipant Table
IF NOT EXISTS (
  SELECT 1 FROM sys.tables WHERE name = 'ErpTSConversationParticipant' AND schema_id = SCHEMA_ID('dbo')
)
BEGIN
  CREATE TABLE [dbo].[ErpTSConversationParticipant] (
    [id] UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT [ErpTSConversationParticipant_pkey] PRIMARY KEY DEFAULT NEWID(),
    [conversationId] UNIQUEIDENTIFIER NOT NULL,
    [userId] UNIQUEIDENTIFIER NOT NULL,
    [joinedAt] DATETIME2 NOT NULL CONSTRAINT [ErpTSConversationParticipant_joinedAt_df] DEFAULT SYSUTCDATETIME(),
    [lastReadAt] DATETIME2 NOT NULL CONSTRAINT [ErpTSConversationParticipant_lastReadAt_df] DEFAULT SYSUTCDATETIME(),
    CONSTRAINT [ErpTSConversationParticipant_conversationId_fkey]
      FOREIGN KEY ([conversationId]) REFERENCES [dbo].[ErpTSConversation]([id])
      ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT [ErpTSConversationParticipant_userId_fkey]
      FOREIGN KEY ([userId]) REFERENCES [dbo].[ErpTSUser]([id])
      ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT [ErpTSConversationParticipant_conv_user_unique]
      UNIQUE ([conversationId], [userId])
  );
END

-- 3. Message Table
IF NOT EXISTS (
  SELECT 1 FROM sys.tables WHERE name = 'ErpTSMessage' AND schema_id = SCHEMA_ID('dbo')
)
BEGIN
  CREATE TABLE [dbo].[ErpTSMessage] (
    [id] UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT [ErpTSMessage_pkey] PRIMARY KEY DEFAULT NEWID(),
    [conversationId] UNIQUEIDENTIFIER NOT NULL,
    [senderId] UNIQUEIDENTIFIER NOT NULL,
    [content] NVARCHAR(MAX) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpTSMessage_createdAt_df] DEFAULT SYSUTCDATETIME(),
    [updatedAt] DATETIME2 NOT NULL CONSTRAINT [ErpTSMessage_updatedAt_df] DEFAULT SYSUTCDATETIME(),
    CONSTRAINT [ErpTSMessage_conversationId_fkey]
      FOREIGN KEY ([conversationId]) REFERENCES [dbo].[ErpTSConversation]([id])
      ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT [ErpTSMessage_senderId_fkey]
      FOREIGN KEY ([senderId]) REFERENCES [dbo].[ErpTSUser]([id])
      ON DELETE CASCADE ON UPDATE NO ACTION
  );
END
