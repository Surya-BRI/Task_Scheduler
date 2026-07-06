IF OBJECT_ID('dbo.ErpTSSchedulerTaskFragment', 'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[ErpTSSchedulerTaskFragment] (
    [id]               UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_ErpTSSchedulerTaskFragment PRIMARY KEY DEFAULT (newid()),
    [taskId]           UNIQUEIDENTIFIER NOT NULL,
    [parentId]         UNIQUEIDENTIFIER NULL,
    [hours]            DECIMAL(10, 2) NOT NULL,
    [status]           NVARCHAR(20) NOT NULL,
    [sourceDesignerId] UNIQUEIDENTIFIER NULL,
    [splitIndex]       INT NULL,
    [totalParts]       INT NULL,
    [createdAt]        DATETIME2 NOT NULL CONSTRAINT DF_ErpTSSchedulerTaskFragment_createdAt DEFAULT (sysutcdatetime()),
    [updatedAt]        DATETIME2 NOT NULL CONSTRAINT DF_ErpTSSchedulerTaskFragment_updatedAt DEFAULT (sysutcdatetime()),
    CONSTRAINT FK_ErpTSSchedulerTaskFragment_Task FOREIGN KEY ([taskId]) REFERENCES [dbo].[ErpTSTask]([id]) ON DELETE CASCADE
  );

  CREATE INDEX IX_ErpTSSchedulerTaskFragment_taskId ON [dbo].[ErpTSSchedulerTaskFragment] ([taskId]);
END;
