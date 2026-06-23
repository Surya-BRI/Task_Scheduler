IF OBJECT_ID('dbo.ErpTSProjectQsAssignment', 'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[ErpTSProjectQsAssignment] (
    [id] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
    [projectId] UNIQUEIDENTIFIER NOT NULL,
    [qsUserId] UNIQUEIDENTIFIER NOT NULL,
    [assignedAt] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT [PK_ErpTSProjectQsAssignment] PRIMARY KEY ([id]),
    CONSTRAINT [UQ_ErpTSProjectQsAssignment_project_user] UNIQUE ([projectId], [qsUserId]),
    CONSTRAINT [FK_ErpTSProjectQsAssignment_Project] FOREIGN KEY ([projectId])
      REFERENCES [dbo].[ErpTSProject]([id]) ON DELETE CASCADE,
    CONSTRAINT [FK_ErpTSProjectQsAssignment_User] FOREIGN KEY ([qsUserId])
      REFERENCES [dbo].[ErpTSUser]([id]) ON DELETE CASCADE
  );
END;

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'IX_ErpTSProjectQsAssignment_qsUserId'
    AND object_id = OBJECT_ID('dbo.ErpTSProjectQsAssignment')
)
BEGIN
  CREATE INDEX [IX_ErpTSProjectQsAssignment_qsUserId]
    ON [dbo].[ErpTSProjectQsAssignment] ([qsUserId], [assignedAt] DESC);
END;

INSERT INTO [dbo].[ErpTSProjectQsAssignment] ([projectId], [qsUserId])
SELECT [project].[id], [user].[id]
FROM [dbo].[ErpTSProject] [project]
INNER JOIN [dbo].[ErpTSUser] [user] ON 1 = 1
INNER JOIN [dbo].[ErpTSRole] [role] ON [role].[id] = [user].[roleId]
WHERE [role].[name] = 'QS'
  AND NOT EXISTS (
    SELECT 1
    FROM [dbo].[ErpTSProjectQsAssignment] [existing]
    WHERE [existing].[projectId] = [project].[id]
      AND [existing].[qsUserId] = [user].[id]
  );

IF OBJECT_ID('dbo.ErpTSProjectQsStatus', 'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[ErpTSProjectQsStatus] (
    [projectId] UNIQUEIDENTIFIER NOT NULL,
    [status] NVARCHAR(20) NOT NULL CONSTRAINT [DF_ErpTSProjectQsStatus_status] DEFAULT ('Pending'),
    [updatedById] UNIQUEIDENTIFIER NULL,
    [submittedById] UNIQUEIDENTIFIER NULL,
    [submittedAt] DATETIME2 NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [DF_ErpTSProjectQsStatus_createdAt] DEFAULT SYSUTCDATETIME(),
    [updatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_ErpTSProjectQsStatus_updatedAt] DEFAULT SYSUTCDATETIME(),
    CONSTRAINT [PK_ErpTSProjectQsStatus] PRIMARY KEY ([projectId]),
    CONSTRAINT [CK_ErpTSProjectQsStatus_status] CHECK ([status] IN ('Pending', 'In Progress', 'Completed')),
    CONSTRAINT [FK_ErpTSProjectQsStatus_Project] FOREIGN KEY ([projectId])
      REFERENCES [dbo].[ErpTSProject]([id]) ON DELETE CASCADE,
    CONSTRAINT [FK_ErpTSProjectQsStatus_UpdatedBy] FOREIGN KEY ([updatedById])
      REFERENCES [dbo].[ErpTSUser]([id]),
    CONSTRAINT [FK_ErpTSProjectQsStatus_SubmittedBy] FOREIGN KEY ([submittedById])
      REFERENCES [dbo].[ErpTSUser]([id])
  );
END;

INSERT INTO [dbo].[ErpTSProjectQsStatus] ([projectId], [status])
SELECT [project].[id], 'Pending'
FROM [dbo].[ErpTSProject] [project]
WHERE NOT EXISTS (
  SELECT 1
  FROM [dbo].[ErpTSProjectQsStatus] [existing]
  WHERE [existing].[projectId] = [project].[id]
);
