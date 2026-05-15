/*
  Task Scheduler — ErpTS referential integrity (idempotent, no data loss).
  - Nulls orphan FK values instead of deleting rows
  - Aligns nvarchar UUID columns to uniqueidentifier where safe
  - Adds missing FOREIGN KEY constraints with explicit ON DELETE / ON UPDATE rules
*/
SET NOCOUNT ON;

-- ---------------------------------------------------------------------------
-- 1) Orphan cleanup (preserve rows; break invalid references)
-- ---------------------------------------------------------------------------
UPDATE c SET c.taskId = NULL
FROM [dbo].[ErpTSChatterPost] c
LEFT JOIN [dbo].[ErpTSTask] t ON c.taskId = t.id
WHERE c.taskId IS NOT NULL AND t.id IS NULL;

UPDATE c SET c.authorId = NULL
FROM [dbo].[ErpTSChatterPost] c
LEFT JOIN [dbo].[ErpTSUser] u ON c.authorId = u.id
WHERE c.authorId IS NOT NULL AND u.id IS NULL;

UPDATE c SET c.mentionUserId = NULL
FROM [dbo].[ErpTSChatterPost] c
LEFT JOIN [dbo].[ErpTSUser] u ON c.mentionUserId = u.id
WHERE c.mentionUserId IS NOT NULL AND u.id IS NULL;

UPDATE r SET r.designerId = NULL
FROM [dbo].[ErpTSRegularizationRequest] r
LEFT JOIN [dbo].[ErpTSUser] u ON r.designerId = u.id
WHERE r.designerId IS NOT NULL AND u.id IS NULL;

UPDATE r SET r.taskId = NULL
FROM [dbo].[ErpTSRegularizationRequest] r
LEFT JOIN [dbo].[ErpTSTask] t ON r.taskId = t.id
WHERE r.taskId IS NOT NULL AND t.id IS NULL;

UPDATE r SET r.approverId = NULL
FROM [dbo].[ErpTSRegularizationRequest] r
LEFT JOIN [dbo].[ErpTSUser] u ON r.approverId = u.id
WHERE r.approverId IS NOT NULL AND u.id IS NULL;

UPDATE o SET o.designerId = NULL
FROM [dbo].[ErpTSOvertimeRequest] o
LEFT JOIN [dbo].[ErpTSUser] u ON o.designerId = u.id
WHERE o.designerId IS NOT NULL AND u.id IS NULL;

UPDATE o SET o.taskId = NULL
FROM [dbo].[ErpTSOvertimeRequest] o
LEFT JOIN [dbo].[ErpTSTask] t ON o.taskId = t.id
WHERE o.taskId IS NOT NULL AND t.id IS NULL;

UPDATE s SET s.designerId = NULL
FROM [dbo].[ErpTSSchedulerAssignment] s
LEFT JOIN [dbo].[ErpTSUser] u ON s.designerId = u.id
WHERE s.designerId IS NOT NULL AND u.id IS NULL;

UPDATE s SET s.taskId = NULL
FROM [dbo].[ErpTSSchedulerAssignment] s
LEFT JOIN [dbo].[ErpTSTask] t ON s.taskId = t.id
WHERE s.taskId IS NOT NULL AND t.id IS NULL;

UPDATE s SET s.assignedBy = NULL
FROM [dbo].[ErpTSSchedulerAssignment] s
LEFT JOIN [dbo].[ErpTSUser] u ON s.assignedBy = u.id
WHERE s.assignedBy IS NOT NULL AND u.id IS NULL;

IF OBJECT_ID(N'[dbo].[ErpTSChatterComment]', N'U') IS NOT NULL
BEGIN
  UPDATE cc SET cc.postId = NULL
  FROM [dbo].[ErpTSChatterComment] cc
  LEFT JOIN [dbo].[ErpTSChatterPost] p ON cc.postId = p.id
  WHERE cc.postId IS NOT NULL AND p.id IS NULL;

  UPDATE cc SET cc.authorId = NULL
  FROM [dbo].[ErpTSChatterComment] cc
  LEFT JOIN [dbo].[ErpTSUser] u ON cc.authorId = u.id
  WHERE cc.authorId IS NOT NULL AND u.id IS NULL;
END

IF OBJECT_ID(N'[dbo].[ErpTSDesignTask]', N'U') IS NOT NULL
BEGIN
  UPDATE dt SET dt.assignedDesignerId = NULL
  FROM [dbo].[ErpTSDesignTask] dt
  LEFT JOIN [dbo].[ErpTSUser] u ON dt.assignedDesignerId = u.id
  WHERE dt.assignedDesignerId IS NOT NULL AND u.id IS NULL;

  UPDATE dt SET dt.lastUpdatedBy = NULL
  FROM [dbo].[ErpTSDesignTask] dt
  LEFT JOIN [dbo].[ErpTSUser] u ON dt.lastUpdatedBy = u.id
  WHERE dt.lastUpdatedBy IS NOT NULL AND u.id IS NULL;
END

-- ---------------------------------------------------------------------------
-- 2) Align reference column types to uniqueidentifier (UUID strings only)
-- ---------------------------------------------------------------------------
IF COL_LENGTH('dbo.ErpTSLeaveRequest', 'userId') IS NOT NULL
   AND EXISTS (
     SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'ErpTSLeaveRequest'
       AND COLUMN_NAME = 'userId' AND DATA_TYPE = 'nvarchar'
   )
BEGIN
  ALTER TABLE [dbo].[ErpTSLeaveRequest] ALTER COLUMN [userId] UNIQUEIDENTIFIER NOT NULL;
END;

IF COL_LENGTH('dbo.ErpTSNotification', 'userId') IS NOT NULL
   AND EXISTS (
     SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'ErpTSNotification'
       AND COLUMN_NAME = 'userId' AND DATA_TYPE = 'nvarchar'
   )
BEGIN
  ALTER TABLE [dbo].[ErpTSNotification] ALTER COLUMN [userId] UNIQUEIDENTIFIER NOT NULL;
END;

IF COL_LENGTH('dbo.ErpTSLinkAttachment', 'chatterPostId') IS NOT NULL
   AND EXISTS (
     SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'ErpTSLinkAttachment'
       AND COLUMN_NAME = 'chatterPostId' AND DATA_TYPE = 'nvarchar'
   )
BEGIN
  ALTER TABLE [dbo].[ErpTSLinkAttachment] ALTER COLUMN [chatterPostId] UNIQUEIDENTIFIER NOT NULL;
END;

-- ---------------------------------------------------------------------------
-- 3) Foreign keys (NO ACTION on user/task parents; CASCADE on chatter children)
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'[dbo].[ErpTSChatterPost]', N'U') IS NOT NULL
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_ErpTSChatterPost_Task')
    ALTER TABLE [dbo].[ErpTSChatterPost] ADD CONSTRAINT [FK_ErpTSChatterPost_Task]
      FOREIGN KEY ([taskId]) REFERENCES [dbo].[ErpTSTask]([id])
      ON DELETE NO ACTION ON UPDATE NO ACTION;

  IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_ErpTSChatterPost_Author')
    ALTER TABLE [dbo].[ErpTSChatterPost] ADD CONSTRAINT [FK_ErpTSChatterPost_Author]
      FOREIGN KEY ([authorId]) REFERENCES [dbo].[ErpTSUser]([id])
      ON DELETE NO ACTION ON UPDATE NO ACTION;

  IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_ErpTSChatterPost_MentionUser')
    ALTER TABLE [dbo].[ErpTSChatterPost] ADD CONSTRAINT [FK_ErpTSChatterPost_MentionUser]
      FOREIGN KEY ([mentionUserId]) REFERENCES [dbo].[ErpTSUser]([id])
      ON DELETE NO ACTION ON UPDATE NO ACTION;
END;

IF OBJECT_ID(N'[dbo].[ErpTSChatterPostAttachment]', N'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_ErpTSChatterPostAttachment_Post')
BEGIN
  ALTER TABLE [dbo].[ErpTSChatterPostAttachment] ADD CONSTRAINT [FK_ErpTSChatterPostAttachment_Post]
    FOREIGN KEY ([chatterPostId]) REFERENCES [dbo].[ErpTSChatterPost]([id])
    ON DELETE CASCADE ON UPDATE NO ACTION;
END;

IF OBJECT_ID(N'[dbo].[ErpTSLinkAttachment]', N'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_ErpTSLinkAttachment_Post')
BEGIN
  ALTER TABLE [dbo].[ErpTSLinkAttachment] ADD CONSTRAINT [FK_ErpTSLinkAttachment_Post]
    FOREIGN KEY ([chatterPostId]) REFERENCES [dbo].[ErpTSChatterPost]([id])
    ON DELETE CASCADE ON UPDATE NO ACTION;
END;

IF OBJECT_ID(N'[dbo].[ErpTSLeaveRequest]', N'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_ErpTSLeaveRequest_User')
BEGIN
  ALTER TABLE [dbo].[ErpTSLeaveRequest] ADD CONSTRAINT [FK_ErpTSLeaveRequest_User]
    FOREIGN KEY ([userId]) REFERENCES [dbo].[ErpTSUser]([id])
    ON DELETE NO ACTION ON UPDATE NO ACTION;
END;

IF OBJECT_ID(N'[dbo].[ErpTSNotification]', N'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_ErpTSNotification_User')
BEGIN
  ALTER TABLE [dbo].[ErpTSNotification] ADD CONSTRAINT [FK_ErpTSNotification_User]
    FOREIGN KEY ([userId]) REFERENCES [dbo].[ErpTSUser]([id])
    ON DELETE CASCADE ON UPDATE NO ACTION;
END;

IF OBJECT_ID(N'[dbo].[ErpTSRegularizationRequest]', N'U') IS NOT NULL
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_ErpTSRegularizationRequest_Designer')
    ALTER TABLE [dbo].[ErpTSRegularizationRequest] ADD CONSTRAINT [FK_ErpTSRegularizationRequest_Designer]
      FOREIGN KEY ([designerId]) REFERENCES [dbo].[ErpTSUser]([id])
      ON DELETE NO ACTION ON UPDATE NO ACTION;

  IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_ErpTSRegularizationRequest_Task')
    ALTER TABLE [dbo].[ErpTSRegularizationRequest] ADD CONSTRAINT [FK_ErpTSRegularizationRequest_Task]
      FOREIGN KEY ([taskId]) REFERENCES [dbo].[ErpTSTask]([id])
      ON DELETE NO ACTION ON UPDATE NO ACTION;

  IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_ErpTSRegularizationRequest_Approver')
    ALTER TABLE [dbo].[ErpTSRegularizationRequest] ADD CONSTRAINT [FK_ErpTSRegularizationRequest_Approver]
      FOREIGN KEY ([approverId]) REFERENCES [dbo].[ErpTSUser]([id])
      ON DELETE NO ACTION ON UPDATE NO ACTION;
END;

IF OBJECT_ID(N'[dbo].[ErpTSOvertimeRequest]', N'U') IS NOT NULL
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_ErpTSOvertimeRequest_Designer')
    ALTER TABLE [dbo].[ErpTSOvertimeRequest] ADD CONSTRAINT [FK_ErpTSOvertimeRequest_Designer]
      FOREIGN KEY ([designerId]) REFERENCES [dbo].[ErpTSUser]([id])
      ON DELETE NO ACTION ON UPDATE NO ACTION;

  IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_ErpTSOvertimeRequest_Task')
    ALTER TABLE [dbo].[ErpTSOvertimeRequest] ADD CONSTRAINT [FK_ErpTSOvertimeRequest_Task]
      FOREIGN KEY ([taskId]) REFERENCES [dbo].[ErpTSTask]([id])
      ON DELETE NO ACTION ON UPDATE NO ACTION;
END;

IF OBJECT_ID(N'[dbo].[ErpTSSchedulerAssignment]', N'U') IS NOT NULL
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_ErpTSSchedulerAssignment_Designer')
    ALTER TABLE [dbo].[ErpTSSchedulerAssignment] ADD CONSTRAINT [FK_ErpTSSchedulerAssignment_Designer]
      FOREIGN KEY ([designerId]) REFERENCES [dbo].[ErpTSUser]([id])
      ON DELETE NO ACTION ON UPDATE NO ACTION;

  IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_ErpTSSchedulerAssignment_Task')
    ALTER TABLE [dbo].[ErpTSSchedulerAssignment] ADD CONSTRAINT [FK_ErpTSSchedulerAssignment_Task]
      FOREIGN KEY ([taskId]) REFERENCES [dbo].[ErpTSTask]([id])
      ON DELETE NO ACTION ON UPDATE NO ACTION;

  IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_ErpTSSchedulerAssignment_AssignedBy')
    ALTER TABLE [dbo].[ErpTSSchedulerAssignment] ADD CONSTRAINT [FK_ErpTSSchedulerAssignment_AssignedBy]
      FOREIGN KEY ([assignedBy]) REFERENCES [dbo].[ErpTSUser]([id])
      ON DELETE NO ACTION ON UPDATE NO ACTION;
END;

IF OBJECT_ID(N'[dbo].[ErpTSChatterComment]', N'U') IS NOT NULL
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_ErpTSChatterComment_Post')
    ALTER TABLE [dbo].[ErpTSChatterComment] ADD CONSTRAINT [FK_ErpTSChatterComment_Post]
      FOREIGN KEY ([postId]) REFERENCES [dbo].[ErpTSChatterPost]([id])
      ON DELETE CASCADE ON UPDATE NO ACTION;

  IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_ErpTSChatterComment_Author')
    ALTER TABLE [dbo].[ErpTSChatterComment] ADD CONSTRAINT [FK_ErpTSChatterComment_Author]
      FOREIGN KEY ([authorId]) REFERENCES [dbo].[ErpTSUser]([id])
      ON DELETE NO ACTION ON UPDATE NO ACTION;
END;

IF OBJECT_ID(N'[dbo].[ErpTSSignageDetail]', N'U') IS NOT NULL
BEGIN
  UPDATE sd SET sd.taskId = NULL
  FROM [dbo].[ErpTSSignageDetail] sd
  LEFT JOIN [dbo].[ErpTSDesignTask] dt ON sd.taskId = dt.id
  WHERE sd.taskId IS NOT NULL AND dt.id IS NULL;

  IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_ErpTSSignageDetail_DesignTask')
    ALTER TABLE [dbo].[ErpTSSignageDetail] ADD CONSTRAINT [FK_ErpTSSignageDetail_DesignTask]
      FOREIGN KEY ([taskId]) REFERENCES [dbo].[ErpTSDesignTask]([id])
      ON DELETE NO ACTION ON UPDATE NO ACTION;
END;

IF OBJECT_ID(N'[dbo].[ErpTSDesignTask]', N'U') IS NOT NULL
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_ErpTSDesignTask_AssignedDesigner')
    ALTER TABLE [dbo].[ErpTSDesignTask] ADD CONSTRAINT [FK_ErpTSDesignTask_AssignedDesigner]
      FOREIGN KEY ([assignedDesignerId]) REFERENCES [dbo].[ErpTSUser]([id])
      ON DELETE NO ACTION ON UPDATE NO ACTION;

  IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_ErpTSDesignTask_LastUpdatedBy')
    ALTER TABLE [dbo].[ErpTSDesignTask] ADD CONSTRAINT [FK_ErpTSDesignTask_LastUpdatedBy]
      FOREIGN KEY ([lastUpdatedBy]) REFERENCES [dbo].[ErpTSUser]([id])
      ON DELETE NO ACTION ON UPDATE NO ACTION;
END;

PRINT 'ErpTS foreign keys and column types are synchronized.';
