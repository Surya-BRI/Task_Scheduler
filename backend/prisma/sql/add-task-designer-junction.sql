-- Creates ErpTSTaskDesigner junction table for multi-designer split task support.
-- Safe to run multiple times (IF NOT EXISTS guard).

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ErpTSTaskDesigner')
BEGIN
  CREATE TABLE ErpTSTaskDesigner (
    id         NVARCHAR(36)     NOT NULL PRIMARY KEY DEFAULT LOWER(NEWID()),
    taskId     UNIQUEIDENTIFIER NOT NULL,
    designerId UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT UX_ErpTSTaskDesigner_Task_Designer UNIQUE (taskId, designerId),
    CONSTRAINT FK_ErpTSTaskDesigner_Task     FOREIGN KEY (taskId)     REFERENCES ErpTSTask(id) ON DELETE CASCADE,
    CONSTRAINT FK_ErpTSTaskDesigner_Designer FOREIGN KEY (designerId) REFERENCES ErpTSUser(id)
  );
  CREATE INDEX IX_ErpTSTaskDesigner_TaskId     ON ErpTSTaskDesigner(taskId);
  CREATE INDEX IX_ErpTSTaskDesigner_DesignerId ON ErpTSTaskDesigner(designerId);
END
