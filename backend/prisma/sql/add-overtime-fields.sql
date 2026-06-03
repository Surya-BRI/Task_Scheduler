-- SQL Migration script to safely add overtime request features in MS SQL Server

-- 1. Alter ErpTSOvertimeRequest table to add new columns if they do not exist
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ErpTSOvertimeRequest') AND name = 'startTime')
BEGIN
    ALTER TABLE [dbo].[ErpTSOvertimeRequest] ADD [startTime] NVARCHAR(50) NULL;
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ErpTSOvertimeRequest') AND name = 'endTime')
BEGIN
    ALTER TABLE [dbo].[ErpTSOvertimeRequest] ADD [endTime] NVARCHAR(50) NULL;
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ErpTSOvertimeRequest') AND name = 'totalHours')
BEGIN
    ALTER TABLE [dbo].[ErpTSOvertimeRequest] ADD [totalHours] DECIMAL(10, 2) NULL;
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ErpTSOvertimeRequest') AND name = 'managerComments')
BEGIN
    ALTER TABLE [dbo].[ErpTSOvertimeRequest] ADD [managerComments] NVARCHAR(MAX) NULL;
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ErpTSOvertimeRequest') AND name = 'hrComments')
BEGIN
    ALTER TABLE [dbo].[ErpTSOvertimeRequest] ADD [hrComments] NVARCHAR(MAX) NULL;
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ErpTSOvertimeRequest') AND name = 'approvedById')
BEGIN
    ALTER TABLE [dbo].[ErpTSOvertimeRequest] ADD [approvedById] UNIQUEIDENTIFIER NULL;
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ErpTSOvertimeRequest') AND name = 'approvedAt')
BEGIN
    ALTER TABLE [dbo].[ErpTSOvertimeRequest] ADD [approvedAt] DATETIME2 NULL;
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ErpTSOvertimeRequest') AND name = 'rejectedById')
BEGIN
    ALTER TABLE [dbo].[ErpTSOvertimeRequest] ADD [rejectedById] UNIQUEIDENTIFIER NULL;
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ErpTSOvertimeRequest') AND name = 'rejectedAt')
BEGIN
    ALTER TABLE [dbo].[ErpTSOvertimeRequest] ADD [rejectedAt] DATETIME2 NULL;
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ErpTSOvertimeRequest') AND name = 'updatedAt')
BEGIN
    ALTER TABLE [dbo].[ErpTSOvertimeRequest] ADD [updatedAt] DATETIME2 NULL CONSTRAINT [ErpTSOvertimeRequest_updatedAt_df] DEFAULT SYSUTCDATETIME();
END

-- 2. Add Foreign Key constraints if not present
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'ErpTSOvertimeRequest_approvedById_fkey')
BEGIN
    ALTER TABLE [dbo].[ErpTSOvertimeRequest] 
    ADD CONSTRAINT [ErpTSOvertimeRequest_approvedById_fkey] 
    FOREIGN KEY ([approvedById]) REFERENCES [dbo].[ErpTSUser]([id]) 
    ON DELETE NO ACTION ON UPDATE NO ACTION;
END

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'ErpTSOvertimeRequest_rejectedById_fkey')
BEGIN
    ALTER TABLE [dbo].[ErpTSOvertimeRequest] 
    ADD CONSTRAINT [ErpTSOvertimeRequest_rejectedById_fkey] 
    FOREIGN KEY ([rejectedById]) REFERENCES [dbo].[ErpTSUser]([id]) 
    ON DELETE NO ACTION ON UPDATE NO ACTION;
END

-- 3. Create ErpTSOvertimeApprovalHistory table if it doesn't exist
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ErpTSOvertimeApprovalHistory' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE [dbo].[ErpTSOvertimeApprovalHistory] (
        [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ErpTSOvertimeApprovalHistory_pkey] PRIMARY KEY DEFAULT NEWID(),
        [requestId] UNIQUEIDENTIFIER NOT NULL,
        [action] NVARCHAR(100) NOT NULL,
        [actionById] UNIQUEIDENTIFIER NOT NULL,
        [comments] NVARCHAR(MAX) NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpTSOvertimeApprovalHistory_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT [ErpTSOvertimeApprovalHistory_requestId_fkey] 
            FOREIGN KEY ([requestId]) REFERENCES [dbo].[ErpTSOvertimeRequest]([id]) 
            ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT [ErpTSOvertimeApprovalHistory_actionById_fkey] 
            FOREIGN KEY ([actionById]) REFERENCES [dbo].[ErpTSUser]([id]) 
            ON DELETE NO ACTION ON UPDATE NO ACTION
    );
END

-- 4. Create ErpTSOvertimeAttachment table if it doesn't exist
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ErpTSOvertimeAttachment' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE [dbo].[ErpTSOvertimeAttachment] (
        [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ErpTSOvertimeAttachment_pkey] PRIMARY KEY DEFAULT NEWID(),
        [fileName] NVARCHAR(255) NOT NULL,
        [filePath] NVARCHAR(MAX) NOT NULL,
        [mimeType] NVARCHAR(100) NULL,
        [sizeBytes] BIGINT NULL,
        [overtimeRequestId] UNIQUEIDENTIFIER NOT NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpTSOvertimeAttachment_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT [ErpTSOvertimeAttachment_overtimeRequestId_fkey] 
            FOREIGN KEY ([overtimeRequestId]) REFERENCES [dbo].[ErpTSOvertimeRequest]([id]) 
            ON DELETE CASCADE ON UPDATE NO ACTION
    );
END
