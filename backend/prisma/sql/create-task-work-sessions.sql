-- Task Work Sessions: stores one record per designer timer submission
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ErpTSTaskWorkSession')
BEGIN
  CREATE TABLE ErpTSTaskWorkSession (
    id              UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    taskId          UNIQUEIDENTIFIER NOT NULL,
    designerId      UNIQUEIDENTIFIER NOT NULL,
    durationSeconds INT              NOT NULL DEFAULT 0,
    submissionLink  NVARCHAR(2000)   NULL,
    pauseLog        NVARCHAR(MAX)    NULL,
    status          NVARCHAR(50)     NOT NULL DEFAULT 'Submitted',
    submittedAt     DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    createdAt       DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),

    CONSTRAINT FK_TaskWorkSession_Task
      FOREIGN KEY (taskId) REFERENCES ErpTSTask(id) ON DELETE CASCADE,

    CONSTRAINT FK_TaskWorkSession_Designer
      FOREIGN KEY (designerId) REFERENCES ErpTSUser(id)
  );

  CREATE INDEX IX_TaskWorkSession_TaskId     ON ErpTSTaskWorkSession (taskId);
  CREATE INDEX IX_TaskWorkSession_DesignerId ON ErpTSTaskWorkSession (designerId);
END
GO

-- Work session files: files uploaded during a timer submission
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ErpTSTaskWorkSessionFile')
BEGIN
  CREATE TABLE ErpTSTaskWorkSessionFile (
    id        UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    sessionId UNIQUEIDENTIFIER NOT NULL,
    fileKey   NVARCHAR(1024)   NOT NULL,
    fileName  NVARCHAR(255)    NOT NULL,
    mimeType  NVARCHAR(100)    NULL,
    sizeBytes BIGINT           NULL,
    createdAt DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),

    CONSTRAINT FK_TaskWorkSessionFile_Session
      FOREIGN KEY (sessionId) REFERENCES ErpTSTaskWorkSession(id) ON DELETE CASCADE
  );

  CREATE INDEX IX_TaskWorkSessionFile_SessionId ON ErpTSTaskWorkSessionFile (sessionId);
END
GO
