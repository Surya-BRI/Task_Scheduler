-- Creates ErpTSReallocationRequest for designer → HOD task reallocation workflow.
-- Safe to run multiple times (IF NOT EXISTS guard).
-- Run with: npx prisma db execute --file prisma/sql/create-reallocation-request.sql --schema prisma/schema.prisma

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ErpTSReallocationRequest')
BEGIN
  CREATE TABLE dbo.ErpTSReallocationRequest (
    id                   UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_ErpTSReallocationRequest PRIMARY KEY DEFAULT NEWID(),
    taskId               UNIQUEIDENTIFIER NOT NULL,
    requesterId          UNIQUEIDENTIFIER NOT NULL,
    suggestedDesignerId  UNIQUEIDENTIFIER NOT NULL,
    targetDesignerId     UNIQUEIDENTIFIER NULL,
    reason               NVARCHAR(MAX)    NOT NULL,
    status               NVARCHAR(50)     NOT NULL CONSTRAINT DF_ErpTSReallocationRequest_status DEFAULT ('Pending'),
    approverId           UNIQUEIDENTIFIER NULL,
    approverRemarks      NVARCHAR(MAX)    NULL,
    reviewedAt           DATETIME2        NULL,
    createdAt            DATETIME2        NOT NULL CONSTRAINT DF_ErpTSReallocationRequest_createdAt DEFAULT (SYSUTCDATETIME()),
    updatedAt            DATETIME2        NOT NULL CONSTRAINT DF_ErpTSReallocationRequest_updatedAt DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT FK_ErpTSReallocationRequest_Task FOREIGN KEY (taskId) REFERENCES dbo.ErpTSTask(id),
    CONSTRAINT FK_ErpTSReallocationRequest_Requester FOREIGN KEY (requesterId) REFERENCES dbo.ErpTSUser(id),
    CONSTRAINT FK_ErpTSReallocationRequest_Suggested FOREIGN KEY (suggestedDesignerId) REFERENCES dbo.ErpTSUser(id),
    CONSTRAINT FK_ErpTSReallocationRequest_Target FOREIGN KEY (targetDesignerId) REFERENCES dbo.ErpTSUser(id),
    CONSTRAINT FK_ErpTSReallocationRequest_Approver FOREIGN KEY (approverId) REFERENCES dbo.ErpTSUser(id)
  );

  CREATE INDEX IX_ErpTSReallocationRequest_requesterId_status
    ON dbo.ErpTSReallocationRequest (requesterId, status);
  CREATE INDEX IX_ErpTSReallocationRequest_taskId_status
    ON dbo.ErpTSReallocationRequest (taskId, status);
  CREATE INDEX IX_ErpTSReallocationRequest_status_createdAt
    ON dbo.ErpTSReallocationRequest (status, createdAt DESC);
END
