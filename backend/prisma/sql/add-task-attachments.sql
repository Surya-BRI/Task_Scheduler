IF OBJECT_ID('dbo.ErpTSProjectAttachment', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.ErpTSProjectAttachment (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_ErpTSProjectAttachment_id DEFAULT NEWID(),
    projectId UNIQUEIDENTIFIER NOT NULL,
    fileKey NVARCHAR(1024) NOT NULL,
    fileName NVARCHAR(255) NOT NULL,
    mimeType NVARCHAR(100) NULL,
    sizeBytes BIGINT NULL,
    uploadedById UNIQUEIDENTIFIER NULL,
    createdAt DATETIME2 NOT NULL CONSTRAINT DF_ErpTSProjectAttachment_createdAt DEFAULT SYSDATETIME(),
    CONSTRAINT PK_ErpTSProjectAttachment PRIMARY KEY (id),
    CONSTRAINT FK_ErpTSProjectAttachment_Project FOREIGN KEY (projectId) REFERENCES dbo.ErpTSProject(id) ON DELETE CASCADE,
    CONSTRAINT FK_ErpTSProjectAttachment_User FOREIGN KEY (uploadedById) REFERENCES dbo.ErpTSUser(id)
  );
  CREATE INDEX IX_ErpTSProjectAttachment_projectId ON dbo.ErpTSProjectAttachment(projectId);
  CREATE INDEX IX_ErpTSProjectAttachment_createdAt ON dbo.ErpTSProjectAttachment(createdAt);
END
GO

IF OBJECT_ID('dbo.ErpTSRetailTaskDetailAttachment', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.ErpTSRetailTaskDetailAttachment (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_ErpTSRetailTaskDetailAttachment_id DEFAULT NEWID(),
    retailTaskDetailId UNIQUEIDENTIFIER NOT NULL,
    fileKey NVARCHAR(1024) NOT NULL,
    fileName NVARCHAR(255) NOT NULL,
    mimeType NVARCHAR(100) NULL,
    sizeBytes BIGINT NULL,
    createdAt DATETIME2 NOT NULL CONSTRAINT DF_ErpTSRetailTaskDetailAttachment_createdAt DEFAULT SYSDATETIME(),
    CONSTRAINT PK_ErpTSRetailTaskDetailAttachment PRIMARY KEY (id),
    CONSTRAINT FK_ErpTSRetailTaskDetailAttachment_Detail FOREIGN KEY (retailTaskDetailId) REFERENCES dbo.ErpTSRetailTaskDetail(id) ON DELETE CASCADE
  );
  CREATE INDEX IX_ErpTSRetailTaskDetailAttachment_detailId ON dbo.ErpTSRetailTaskDetailAttachment(retailTaskDetailId);
  CREATE INDEX IX_ErpTSRetailTaskDetailAttachment_createdAt ON dbo.ErpTSRetailTaskDetailAttachment(createdAt);
END
GO

IF OBJECT_ID('dbo.ErpTSProjectTaskDetailAttachment', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.ErpTSProjectTaskDetailAttachment (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_ErpTSProjectTaskDetailAttachment_id DEFAULT NEWID(),
    projectTaskDetailId UNIQUEIDENTIFIER NOT NULL,
    fileKey NVARCHAR(1024) NOT NULL,
    fileName NVARCHAR(255) NOT NULL,
    mimeType NVARCHAR(100) NULL,
    sizeBytes BIGINT NULL,
    createdAt DATETIME2 NOT NULL CONSTRAINT DF_ErpTSProjectTaskDetailAttachment_createdAt DEFAULT SYSDATETIME(),
    CONSTRAINT PK_ErpTSProjectTaskDetailAttachment PRIMARY KEY (id),
    CONSTRAINT FK_ErpTSProjectTaskDetailAttachment_Detail FOREIGN KEY (projectTaskDetailId) REFERENCES dbo.ErpTSProjectTaskDetail(id) ON DELETE CASCADE
  );
  CREATE INDEX IX_ErpTSProjectTaskDetailAttachment_detailId ON dbo.ErpTSProjectTaskDetailAttachment(projectTaskDetailId);
  CREATE INDEX IX_ErpTSProjectTaskDetailAttachment_createdAt ON dbo.ErpTSProjectTaskDetailAttachment(createdAt);
END
GO

IF COL_LENGTH('dbo.ErpTSRetailTaskDetail', 'fileUrl') IS NULL
BEGIN
  ALTER TABLE dbo.ErpTSRetailTaskDetail
  ADD fileUrl NVARCHAR(2000) NULL;
END
GO
