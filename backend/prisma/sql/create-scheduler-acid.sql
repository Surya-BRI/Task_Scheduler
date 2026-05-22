SET XACT_ABORT ON;
BEGIN TRAN;

IF OBJECT_ID(N'[dbo].[ErpTSSchedulerWeek]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[ErpTSSchedulerWeek] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_ErpTSSchedulerWeek_id] DEFAULT NEWID(),
    [weekStartDate] DATE NOT NULL,
    [version] INT NOT NULL CONSTRAINT [DF_ErpTSSchedulerWeek_version] DEFAULT 0,
    [isLocked] BIT NOT NULL CONSTRAINT [DF_ErpTSSchedulerWeek_isLocked] DEFAULT 0,
    [updatedBy] UNIQUEIDENTIFIER NULL,
    [lastPayloadHash] NVARCHAR(128) NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [DF_ErpTSSchedulerWeek_createdAt] DEFAULT SYSUTCDATETIME(),
    [updatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_ErpTSSchedulerWeek_updatedAt] DEFAULT SYSUTCDATETIME(),
    CONSTRAINT [PK_ErpTSSchedulerWeek] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UQ_ErpTSSchedulerWeek_weekStartDate] UNIQUE ([weekStartDate])
  );
END;

IF OBJECT_ID(N'[dbo].[ErpTSSchedulerAssignmentHistory]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[ErpTSSchedulerAssignmentHistory] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_ErpTSSchedulerAssignmentHistory_id] DEFAULT NEWID(),
    [weekStartDate] DATE NOT NULL,
    [versionFrom] INT NOT NULL,
    [versionTo] INT NOT NULL,
    [changedBy] UNIQUEIDENTIFIER NULL,
    [beforeJson] NVARCHAR(MAX) NULL,
    [afterJson] NVARCHAR(MAX) NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [DF_ErpTSSchedulerAssignmentHistory_createdAt] DEFAULT SYSUTCDATETIME(),
    CONSTRAINT [PK_ErpTSSchedulerAssignmentHistory] PRIMARY KEY CLUSTERED ([id])
  );
  CREATE INDEX [IX_ErpTSSchedulerAssignmentHistory_weekStartDate] ON [dbo].[ErpTSSchedulerAssignmentHistory]([weekStartDate]);
END;

IF COL_LENGTH('dbo.ErpTSSchedulerAssignment', 'designerId') IS NOT NULL
  ALTER TABLE [dbo].[ErpTSSchedulerAssignment] ALTER COLUMN [designerId] UNIQUEIDENTIFIER NOT NULL;
IF COL_LENGTH('dbo.ErpTSSchedulerAssignment', 'taskId') IS NOT NULL
  ALTER TABLE [dbo].[ErpTSSchedulerAssignment] ALTER COLUMN [taskId] UNIQUEIDENTIFIER NOT NULL;
IF COL_LENGTH('dbo.ErpTSSchedulerAssignment', 'dayIndex') IS NOT NULL
  ALTER TABLE [dbo].[ErpTSSchedulerAssignment] ALTER COLUMN [dayIndex] INT NOT NULL;
IF COL_LENGTH('dbo.ErpTSSchedulerAssignment', 'assignedHours') IS NOT NULL
  ALTER TABLE [dbo].[ErpTSSchedulerAssignment] ALTER COLUMN [assignedHours] DECIMAL(10,2) NOT NULL;
IF COL_LENGTH('dbo.ErpTSSchedulerAssignment', 'weekStartDate') IS NOT NULL
  ALTER TABLE [dbo].[ErpTSSchedulerAssignment] ALTER COLUMN [weekStartDate] DATE NOT NULL;

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_ErpTSSchedulerAssignment_DayIndex')
  ALTER TABLE [dbo].[ErpTSSchedulerAssignment] ADD CONSTRAINT [CK_ErpTSSchedulerAssignment_DayIndex] CHECK ([dayIndex] BETWEEN 0 AND 6);
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_ErpTSSchedulerAssignment_AssignedHours')
  ALTER TABLE [dbo].[ErpTSSchedulerAssignment] ADD CONSTRAINT [CK_ErpTSSchedulerAssignment_AssignedHours] CHECK ([assignedHours] > 0);
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_ErpTSSchedulerAssignment_Split')
  ALTER TABLE [dbo].[ErpTSSchedulerAssignment] ADD CONSTRAINT [CK_ErpTSSchedulerAssignment_Split] CHECK (([splitIndex] IS NULL AND [totalParts] IS NULL) OR ([splitIndex] >= 1 AND [totalParts] >= [splitIndex]));

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_ErpTSSchedulerAssignment_week_designer_day_task_split')
  CREATE UNIQUE INDEX [UQ_ErpTSSchedulerAssignment_week_designer_day_task_split]
  ON [dbo].[ErpTSSchedulerAssignment]([weekStartDate], [designerId], [dayIndex], [taskId], [splitIndex]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ErpTSSchedulerAssignment_week_designer')
  CREATE INDEX [IX_ErpTSSchedulerAssignment_week_designer]
  ON [dbo].[ErpTSSchedulerAssignment]([weekStartDate], [designerId]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ErpTSSchedulerAssignment_week_task')
  CREATE INDEX [IX_ErpTSSchedulerAssignment_week_task]
  ON [dbo].[ErpTSSchedulerAssignment]([weekStartDate], [taskId]);

COMMIT TRAN;
