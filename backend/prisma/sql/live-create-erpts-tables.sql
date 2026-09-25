BEGIN TRY

BEGIN TRAN;

-- CreateSchema
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = N'dbo') EXEC sp_executesql N'CREATE SCHEMA [dbo];';

-- CreateTable
CREATE TABLE [dbo].[ErpTSProject] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ErpTSProject_id_df] DEFAULT newid(),
    [projectNo] NVARCHAR(1000),
    [name] NVARCHAR(200) NOT NULL,
    [category] NVARCHAR(100) NOT NULL CONSTRAINT [ErpTSProject_category_df] DEFAULT 'Project',
    [businessUnit] NVARCHAR(255),
    [description] NVARCHAR(max),
    [status] NVARCHAR(50) NOT NULL CONSTRAINT [ErpTSProject_status_df] DEFAULT 'ACTIVE',
    [salesPerson] NVARCHAR(255),
    [technicalHead] NVARCHAR(255),
    [teamLead] NVARCHAR(255),
    [subTeamLead] NVARCHAR(255),
    [designers] NVARCHAR(max),
    [createdById] BIGINT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpTSProject_createdAt_df] DEFAULT sysutcdatetime(),
    [updatedAt] DATETIME2 NOT NULL CONSTRAINT [ErpTSProject_updatedAt_df] DEFAULT sysutcdatetime(),
    CONSTRAINT [ErpTSProject_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ErpTSProject_projectNo_key] UNIQUE NONCLUSTERED ([projectNo])
);

-- CreateTable
CREATE TABLE [dbo].[ErpTSProjectQsAssignment] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ErpTSProjectQsAssignment_id_df] DEFAULT newid(),
    [projectId] UNIQUEIDENTIFIER NOT NULL,
    [qsUserId] BIGINT NOT NULL,
    [assignedAt] DATETIME2 NOT NULL CONSTRAINT [ErpTSProjectQsAssignment_assignedAt_df] DEFAULT sysutcdatetime(),
    CONSTRAINT [ErpTSProjectQsAssignment_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ErpTSProjectQsAssignment_projectId_qsUserId_key] UNIQUE NONCLUSTERED ([projectId],[qsUserId])
);

-- CreateTable
CREATE TABLE [dbo].[ErpTSProjectQsStatus] (
    [projectId] UNIQUEIDENTIFIER NOT NULL,
    [status] NVARCHAR(20) NOT NULL CONSTRAINT [ErpTSProjectQsStatus_status_df] DEFAULT 'Pending',
    [updatedById] BIGINT,
    [submittedById] BIGINT,
    [submittedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpTSProjectQsStatus_createdAt_df] DEFAULT sysutcdatetime(),
    [updatedAt] DATETIME2 NOT NULL CONSTRAINT [ErpTSProjectQsStatus_updatedAt_df] DEFAULT sysutcdatetime(),
    CONSTRAINT [ErpTSProjectQsStatus_pkey] PRIMARY KEY CLUSTERED ([projectId])
);

-- CreateTable
CREATE TABLE [dbo].[ErpTSTask] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ErpTSTask_id_df] DEFAULT newid(),
    [taskNo] NVARCHAR(100) NOT NULL,
    [opNo] NVARCHAR(100),
    [title] NVARCHAR(200),
    [revisionCode] NVARCHAR(20),
    [designType] NVARCHAR(80),
    [signType] NVARCHAR(255),
    [signFamily] NVARCHAR(255),
    [disciplineType] NVARCHAR(50),
    [phase] INT,
    [description] NVARCHAR(max),
    [status] NVARCHAR(20) NOT NULL CONSTRAINT [ErpTSTask_status_df] DEFAULT 'DESIGN_NEW',
    [priority] NVARCHAR(50) NOT NULL CONSTRAINT [ErpTSTask_priority_df] DEFAULT 'Medium',
    [projectId] UNIQUEIDENTIFIER NOT NULL,
    [assigneeId] BIGINT,
    [dueDate] DATETIME2,
    [startedAt] DATETIME2,
    [completedAt] DATETIME2,
    [holdPreviousStatus] NVARCHAR(50),
    [reworkNote] NVARCHAR(max),
    [reworkAttachmentUrl] NVARCHAR(2000),
    [reworkAttachmentName] NVARCHAR(255),
    [reworkLinkUrl] NVARCHAR(2000),
    [reworkLinkName] NVARCHAR(255),
    [previousRevisionTaskId] NVARCHAR(36),
    [technicalHead] NVARCHAR(255),
    [teamLead] NVARCHAR(255),
    [subTeamLead] NVARCHAR(255),
    [designers] NVARCHAR(max),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpTSTask_createdAt_df] DEFAULT sysutcdatetime(),
    [updatedAt] DATETIME2 NOT NULL CONSTRAINT [ErpTSTask_updatedAt_df] DEFAULT sysutcdatetime(),
    CONSTRAINT [ErpTSTask_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ErpTSTask_taskNo_key] UNIQUE NONCLUSTERED ([taskNo])
);

-- CreateTable
CREATE TABLE [dbo].[ErpTSRetailTaskDetail] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ErpTSRetailTaskDetail_id_df] DEFAULT newid(),
    [taskId] UNIQUEIDENTIFIER NOT NULL,
    [providedFile] NVARCHAR(255),
    [fileKey] NVARCHAR(1024),
    [fileUrl] NVARCHAR(2000),
    [hodName] NVARCHAR(255),
    [designTypes] NVARCHAR(500),
    [hoursRequired] INT,
    [comment] NVARCHAR(max),
    [signFamily] NVARCHAR(255),
    [signType] NVARCHAR(255),
    [planCode] NVARCHAR(100),
    [contractRef] NVARCHAR(100),
    [quantity] INT,
    [deadline] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpTSRetailTaskDetail_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ErpTSRetailTaskDetail_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ErpTSProjectTaskDetail] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ErpTSProjectTaskDetail_id_df] DEFAULT newid(),
    [taskId] UNIQUEIDENTIFIER NOT NULL,
    [signType] NVARCHAR(255),
    [planCode] NVARCHAR(100),
    [area] NVARCHAR(100),
    [level] NVARCHAR(100),
    [artwork] BIT CONSTRAINT [ErpTSProjectTaskDetail_artwork_df] DEFAULT 0,
    [artworkHours] INT,
    [technical] BIT CONSTRAINT [ErpTSProjectTaskDetail_technical_df] DEFAULT 0,
    [technicalHours] INT,
    [location] BIT CONSTRAINT [ErpTSProjectTaskDetail_location_df] DEFAULT 0,
    [locationHours] INT,
    [asBuilt] BIT CONSTRAINT [ErpTSProjectTaskDetail_asBuilt_df] DEFAULT 0,
    [asBuiltHours] INT,
    [productionRelease] BIT CONSTRAINT [ErpTSProjectTaskDetail_productionRelease_df] DEFAULT 0,
    [productionReleaseHours] INT,
    [bim] BIT CONSTRAINT [ErpTSProjectTaskDetail_bim_df] DEFAULT 0,
    [deadline] DATETIME2,
    [comment] NVARCHAR(max),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpTSProjectTaskDetail_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ErpTSProjectTaskDetail_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ErpTSProjectSignRow] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ErpTSProjectSignRow_id_df] DEFAULT newid(),
    [projectId] UNIQUEIDENTIFIER NOT NULL,
    [tNo] NVARCHAR(50),
    [no] NVARCHAR(50),
    [signType] NVARCHAR(255),
    [planCode] NVARCHAR(100),
    [estQty] INT,
    [qsQty] INT,
    [areaZone] NVARCHAR(100),
    [levelParcel] NVARCHAR(100),
    [sequence] NVARCHAR(100),
    [status] NVARCHAR(50),
    [comment] NVARCHAR(max),
    [contRef] NVARCHAR(100),
    [signFamily] NVARCHAR(255),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpTSProjectSignRow_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ErpTSProjectSignRow_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ErpTSProjectAttachment] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ErpTSProjectAttachment_id_df] DEFAULT newid(),
    [projectId] UNIQUEIDENTIFIER NOT NULL,
    [fileKey] NVARCHAR(1024) NOT NULL,
    [fileName] NVARCHAR(255) NOT NULL,
    [mimeType] NVARCHAR(100),
    [sizeBytes] BIGINT,
    [uploadedById] BIGINT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpTSProjectAttachment_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ErpTSProjectAttachment_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ErpTSRetailTaskDetailAttachment] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ErpTSRetailTaskDetailAttachment_id_df] DEFAULT newid(),
    [retailTaskDetailId] UNIQUEIDENTIFIER NOT NULL,
    [fileKey] NVARCHAR(1024) NOT NULL,
    [fileName] NVARCHAR(255) NOT NULL,
    [mimeType] NVARCHAR(100),
    [sizeBytes] BIGINT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpTSRetailTaskDetailAttachment_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ErpTSRetailTaskDetailAttachment_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ErpTSProjectTaskDetailAttachment] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ErpTSProjectTaskDetailAttachment_id_df] DEFAULT newid(),
    [projectTaskDetailId] UNIQUEIDENTIFIER NOT NULL,
    [fileKey] NVARCHAR(1024) NOT NULL,
    [fileName] NVARCHAR(255) NOT NULL,
    [mimeType] NVARCHAR(100),
    [sizeBytes] BIGINT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpTSProjectTaskDetailAttachment_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ErpTSProjectTaskDetailAttachment_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ErpTSDesignTask] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ErpTSDesignTask_id_df] DEFAULT newid(),
    [opNo] NVARCHAR(100),
    [projectNo] NVARCHAR(100),
    [name] NVARCHAR(255),
    [description] NVARCHAR(max),
    [designType] NVARCHAR(50),
    [businessUnit] NVARCHAR(100),
    [status] NVARCHAR(50),
    [salesPerson] BIGINT,
    [assignedDesignerId] BIGINT,
    [lastUpdatedBy] BIGINT,
    [deadline] DATETIME,
    [agingDays] INT,
    [priority] NVARCHAR(20),
    [estimatedHours] DECIMAL(10,2),
    [completedHours] DECIMAL(10,2),
    [revisionCount] INT CONSTRAINT [ErpTSDesignTask_revisionCount_df] DEFAULT 0,
    [completionPercentage] INT CONSTRAINT [ErpTSDesignTask_completionPercentage_df] DEFAULT 0,
    [isOverdue] BIT CONSTRAINT [ErpTSDesignTask_isOverdue_df] DEFAULT 0,
    [isDeleted] BIT CONSTRAINT [ErpTSDesignTask_isDeleted_df] DEFAULT 0,
    [created] DATETIME CONSTRAINT [ErpTSDesignTask_created_df] DEFAULT CURRENT_TIMESTAMP,
    [createdAt] DATETIME CONSTRAINT [ErpTSDesignTask_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME CONSTRAINT [ErpTSDesignTask_updatedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ErpTSDesignTask_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ErpTSSignageDetail] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ErpTSSignageDetail_id_df] DEFAULT newid(),
    [taskId] UNIQUEIDENTIFIER,
    [signFamily] NVARCHAR(255),
    [signType] NVARCHAR(255),
    [planCode] NVARCHAR(100),
    [contractRef] NVARCHAR(100),
    [quantity] INT,
    [createdAt] DATETIME CONSTRAINT [ErpTSSignageDetail_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ErpTSSignageDetail_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ErpTSChatterPost] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ErpTSChatterPost_id_df] DEFAULT newid(),
    [title] NVARCHAR(255),
    [message] NVARCHAR(max),
    [postType] NVARCHAR(50),
    [priority] NVARCHAR(20),
    [visibility] NVARCHAR(50),
    [seenByCount] INT CONSTRAINT [ErpTSChatterPost_seenByCount_df] DEFAULT 0,
    [attachmentCount] INT CONSTRAINT [ErpTSChatterPost_attachmentCount_df] DEFAULT 0,
    [isPinned] BIT CONSTRAINT [ErpTSChatterPost_isPinned_df] DEFAULT 0,
    [editedAt] DATETIME,
    [taskId] UNIQUEIDENTIFIER,
    [projectId] UNIQUEIDENTIFIER,
    [authorId] BIGINT,
    [mentionUserId] BIGINT,
    [createdAt] DATETIME CONSTRAINT [ErpTSChatterPost_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME CONSTRAINT [ErpTSChatterPost_updatedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ErpTSChatterPost_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ErpTSChatterComment] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ErpTSChatterComment_id_df] DEFAULT newid(),
    [postId] UNIQUEIDENTIFIER,
    [authorId] BIGINT,
    [mentionUserId] BIGINT,
    [message] NVARCHAR(max),
    [createdAt] DATETIME CONSTRAINT [ErpTSChatterComment_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ErpTSChatterComment_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ErpTSChatterPostMention] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ErpTSChatterPostMention_id_df] DEFAULT newid(),
    [postId] UNIQUEIDENTIFIER NOT NULL,
    [userId] BIGINT NOT NULL,
    [createdAt] DATETIME NOT NULL CONSTRAINT [ErpTSChatterPostMention_createdAt_df] DEFAULT sysutcdatetime(),
    CONSTRAINT [ErpTSChatterPostMention_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ErpTSChatterPostMention_postId_userId_key] UNIQUE NONCLUSTERED ([postId],[userId])
);

-- CreateTable
CREATE TABLE [dbo].[ErpTSChatterCommentMention] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ErpTSChatterCommentMention_id_df] DEFAULT newid(),
    [commentId] UNIQUEIDENTIFIER NOT NULL,
    [userId] BIGINT NOT NULL,
    [createdAt] DATETIME NOT NULL CONSTRAINT [ErpTSChatterCommentMention_createdAt_df] DEFAULT sysutcdatetime(),
    CONSTRAINT [ErpTSChatterCommentMention_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ErpTSChatterCommentMention_commentId_userId_key] UNIQUE NONCLUSTERED ([commentId],[userId])
);

-- CreateTable
CREATE TABLE [dbo].[ErpTSChatterPostLike] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ErpTSChatterPostLike_id_df] DEFAULT newid(),
    [postId] UNIQUEIDENTIFIER NOT NULL,
    [userId] BIGINT NOT NULL,
    [createdAt] DATETIME NOT NULL CONSTRAINT [ErpTSChatterPostLike_createdAt_df] DEFAULT sysutcdatetime(),
    CONSTRAINT [ErpTSChatterPostLike_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ErpTSChatterPostLike_postId_userId_key] UNIQUE NONCLUSTERED ([postId],[userId])
);

-- CreateTable
CREATE TABLE [dbo].[ErpTSChatterPostSeen] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ErpTSChatterPostSeen_id_df] DEFAULT newid(),
    [postId] UNIQUEIDENTIFIER NOT NULL,
    [userId] BIGINT NOT NULL,
    [seenAt] DATETIME NOT NULL CONSTRAINT [ErpTSChatterPostSeen_seenAt_df] DEFAULT sysutcdatetime(),
    CONSTRAINT [ErpTSChatterPostSeen_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ErpTSChatterPostSeen_postId_userId_key] UNIQUE NONCLUSTERED ([postId],[userId])
);

-- CreateTable
CREATE TABLE [dbo].[ErpTSChatterPostAttachment] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ErpTSChatterPostAttachment_id_df] DEFAULT newid(),
    [fileName] NVARCHAR(255) NOT NULL,
    [filePath] NVARCHAR(1000) NOT NULL,
    [fileUrl] NVARCHAR(2000),
    [mimeType] NVARCHAR(100),
    [sizeBytes] BIGINT,
    [chatterPostId] UNIQUEIDENTIFIER NOT NULL,
    [createdAt] DATETIME CONSTRAINT [ErpTSChatterPostAttachment_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ErpTSChatterPostAttachment_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ErpTSLinkAttachment] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ErpTSLinkAttachment_id_df] DEFAULT newid(),
    [url] NVARCHAR(2000) NOT NULL,
    [platform] NVARCHAR(255),
    [displayName] NVARCHAR(1000),
    [chatterPostId] UNIQUEIDENTIFIER NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpTSLinkAttachment_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ErpTSLinkAttachment_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ErpTSLeaveRequest] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ErpTSLeaveRequest_id_df] DEFAULT newid(),
    [userId] BIGINT NOT NULL,
    [type] NVARCHAR(255) NOT NULL,
    [status] NVARCHAR(255) NOT NULL CONSTRAINT [ErpTSLeaveRequest_status_df] DEFAULT 'Pending',
    [startDate] DATETIME2 NOT NULL,
    [endDate] DATETIME2,
    [halfDaySession] NVARCHAR(50),
    [reason] NVARCHAR(max),
    [approverId] BIGINT,
    [approverRemarks] NVARCHAR(max),
    [reviewedAt] DATETIME,
    [revokedById] BIGINT,
    [revokedAt] DATETIME,
    [revocationReason] NVARCHAR(max),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpTSLeaveRequest_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL CONSTRAINT [ErpTSLeaveRequest_updatedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ErpTSLeaveRequest_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ErpTSRegularizationRequest] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ErpTSRegularizationRequest_id_df] DEFAULT newid(),
    [designerId] BIGINT,
    [taskId] UNIQUEIDENTIFIER,
    [date] DATE,
    [duration] NVARCHAR(100),
    [reason] NVARCHAR(100),
    [notes] NVARCHAR(max),
    [status] NVARCHAR(50),
    [approverId] BIGINT,
    [approverRemarks] NVARCHAR(max),
    [reviewedAt] DATETIME,
    [createdAt] DATETIME2 CONSTRAINT [ErpTSRegularizationRequest_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ErpTSRegularizationRequest_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ErpTSReallocationRequest] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ErpTSReallocationRequest_id_df] DEFAULT newid(),
    [taskId] UNIQUEIDENTIFIER NOT NULL,
    [requesterId] BIGINT NOT NULL,
    [suggestedDesignerId] BIGINT NOT NULL,
    [targetDesignerId] BIGINT,
    [reason] NVARCHAR(max) NOT NULL,
    [status] NVARCHAR(50) NOT NULL CONSTRAINT [ErpTSReallocationRequest_status_df] DEFAULT 'Pending',
    [approverId] BIGINT,
    [approverRemarks] NVARCHAR(max),
    [reviewedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpTSReallocationRequest_createdAt_df] DEFAULT sysutcdatetime(),
    [updatedAt] DATETIME2 NOT NULL CONSTRAINT [ErpTSReallocationRequest_updatedAt_df] DEFAULT sysutcdatetime(),
    CONSTRAINT [ErpTSReallocationRequest_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ErpTSOvertimeRequest] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ErpTSOvertimeRequest_id_df] DEFAULT newid(),
    [designerId] BIGINT,
    [taskId] UNIQUEIDENTIFIER,
    [date] DATE,
    [estimatedRemaining] NVARCHAR(255),
    [requestedHours] DECIMAL(10,2),
    [approvedHours] DECIMAL(10,2),
    [reason] NVARCHAR(max),
    [status] NVARCHAR(50),
    [createdAt] DATETIME2 CONSTRAINT [ErpTSOvertimeRequest_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [startTime] NVARCHAR(50),
    [endTime] NVARCHAR(50),
    [totalHours] DECIMAL(10,2),
    [managerComments] NVARCHAR(max),
    [hrComments] NVARCHAR(max),
    [approvedById] BIGINT,
    [approvedAt] DATETIME,
    [rejectedById] BIGINT,
    [rejectedAt] DATETIME,
    [updatedAt] DATETIME2 CONSTRAINT [ErpTSOvertimeRequest_updatedAt_df] DEFAULT sysutcdatetime(),
    CONSTRAINT [ErpTSOvertimeRequest_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ErpTSOvertimeApprovalHistory] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ErpTSOvertimeApprovalHistory_id_df] DEFAULT newid(),
    [requestId] UNIQUEIDENTIFIER NOT NULL,
    [action] NVARCHAR(100) NOT NULL,
    [actionById] BIGINT NOT NULL,
    [comments] NVARCHAR(max),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpTSOvertimeApprovalHistory_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ErpTSOvertimeApprovalHistory_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ErpTSOvertimeAttachment] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ErpTSOvertimeAttachment_id_df] DEFAULT newid(),
    [fileName] NVARCHAR(255) NOT NULL,
    [filePath] NVARCHAR(max) NOT NULL,
    [mimeType] NVARCHAR(100),
    [sizeBytes] BIGINT,
    [overtimeRequestId] UNIQUEIDENTIFIER NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpTSOvertimeAttachment_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ErpTSOvertimeAttachment_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ErpTSSchedulerAssignment] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ErpTSSchedulerAssignment_id_df] DEFAULT newid(),
    [designerId] BIGINT,
    [taskId] UNIQUEIDENTIFIER,
    [dayIndex] INT,
    [assignedHours] DECIMAL(10,2),
    [parentId] UNIQUEIDENTIFIER,
    [splitIndex] INT,
    [totalParts] INT,
    [weekStartDate] DATE,
    [weekEndDate] DATE,
    [notes] NVARCHAR(max),
    [position] INT CONSTRAINT [ErpTSSchedulerAssignment_position_df] DEFAULT 0,
    [isLocked] BIT CONSTRAINT [ErpTSSchedulerAssignment_isLocked_df] DEFAULT 0,
    [isPinned] BIT CONSTRAINT [ErpTSSchedulerAssignment_isPinned_df] DEFAULT 0,
    [assignedBy] BIGINT,
    [createdAt] DATETIME2 CONSTRAINT [ErpTSSchedulerAssignment_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 CONSTRAINT [ErpTSSchedulerAssignment_updatedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ErpTSSchedulerAssignment_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ErpTSSchedulerTaskFragment] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ErpTSSchedulerTaskFragment_id_df] DEFAULT newid(),
    [taskId] UNIQUEIDENTIFIER NOT NULL,
    [parentId] UNIQUEIDENTIFIER,
    [hours] DECIMAL(10,2) NOT NULL,
    [status] NVARCHAR(20) NOT NULL,
    [sourceDesignerId] BIGINT,
    [splitIndex] INT,
    [totalParts] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpTSSchedulerTaskFragment_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL CONSTRAINT [ErpTSSchedulerTaskFragment_updatedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ErpTSSchedulerTaskFragment_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ErpTSSchedulerWeek] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ErpTSSchedulerWeek_id_df] DEFAULT newid(),
    [weekStartDate] DATE NOT NULL,
    [version] INT NOT NULL CONSTRAINT [ErpTSSchedulerWeek_version_df] DEFAULT 0,
    [isLocked] BIT NOT NULL CONSTRAINT [ErpTSSchedulerWeek_isLocked_df] DEFAULT 0,
    [updatedBy] BIGINT,
    [lastPayloadHash] NVARCHAR(128),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpTSSchedulerWeek_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL CONSTRAINT [ErpTSSchedulerWeek_updatedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ErpTSSchedulerWeek_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ErpTSSchedulerWeek_weekStartDate_key] UNIQUE NONCLUSTERED ([weekStartDate])
);

-- CreateTable
CREATE TABLE [dbo].[ErpTSSchedulerAssignmentHistory] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ErpTSSchedulerAssignmentHistory_id_df] DEFAULT newid(),
    [weekStartDate] DATE NOT NULL,
    [versionFrom] INT NOT NULL,
    [versionTo] INT NOT NULL,
    [changedBy] BIGINT,
    [beforeJson] NVARCHAR(max),
    [afterJson] NVARCHAR(max),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpTSSchedulerAssignmentHistory_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ErpTSSchedulerAssignmentHistory_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ErpTSHoliday] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ErpTSHoliday_id_df] DEFAULT newid(),
    [date] DATE NOT NULL,
    [name] NVARCHAR(255),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpTSHoliday_createdAt_df] DEFAULT sysutcdatetime(),
    [updatedAt] DATETIME2 NOT NULL CONSTRAINT [ErpTSHoliday_updatedAt_df] DEFAULT sysutcdatetime(),
    CONSTRAINT [ErpTSHoliday_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ErpTSHoliday_date_key] UNIQUE NONCLUSTERED ([date])
);

-- CreateTable
CREATE TABLE [dbo].[ErpTSSchedulerDayUnlock] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ErpTSSchedulerDayUnlock_id_df] DEFAULT newid(),
    [designerId] BIGINT NOT NULL,
    [date] DATE NOT NULL,
    [unlockedById] BIGINT NOT NULL,
    [reason] NVARCHAR(500),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpTSSchedulerDayUnlock_createdAt_df] DEFAULT sysutcdatetime(),
    CONSTRAINT [ErpTSSchedulerDayUnlock_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ErpTSSchedulerDayUnlock_designerId_date_key] UNIQUE NONCLUSTERED ([designerId],[date])
);

-- CreateTable
CREATE TABLE [dbo].[ErpTSLeaveRescheduleSnapshot] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ErpTSLeaveRescheduleSnapshot_id_df] DEFAULT newid(),
    [leaveRequestId] UNIQUEIDENTIFIER NOT NULL,
    [assignmentId] UNIQUEIDENTIFIER NOT NULL,
    [originalJson] NVARCHAR(max) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpTSLeaveRescheduleSnapshot_createdAt_df] DEFAULT sysutcdatetime(),
    [restoredAt] DATETIME2,
    CONSTRAINT [ErpTSLeaveRescheduleSnapshot_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ErpTSLeaveRescheduleSnapshot_leaveRequestId_assignmentId_key] UNIQUE NONCLUSTERED ([leaveRequestId],[assignmentId])
);

-- CreateTable
CREATE TABLE [dbo].[ErpTSActivityLog] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ErpTSActivityLog_id_df] DEFAULT newid(),
    [action] NVARCHAR(1000) NOT NULL,
    [details] NVARCHAR(max),
    [userId] BIGINT NOT NULL,
    [taskId] UNIQUEIDENTIFIER,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpTSActivityLog_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ErpTSActivityLog_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ErpTSNotification] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ErpTSNotification_id_df] DEFAULT newid(),
    [userId] BIGINT NOT NULL,
    [title] NVARCHAR(1000) NOT NULL,
    [message] NVARCHAR(max) NOT NULL,
    [isRead] BIT NOT NULL CONSTRAINT [ErpTSNotification_isRead_df] DEFAULT 0,
    [linkUrl] NVARCHAR(2000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpTSNotification_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ErpTSNotification_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ErpTSInboxRead] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ErpTSInboxRead_id_df] DEFAULT newid(),
    [userId] BIGINT NOT NULL,
    [itemKey] NVARCHAR(200) NOT NULL,
    [isRead] BIT NOT NULL CONSTRAINT [ErpTSInboxRead_isRead_df] DEFAULT 1,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [ErpTSInboxRead_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ErpTSInboxRead_userId_itemKey_key] UNIQUE NONCLUSTERED ([userId],[itemKey])
);

-- CreateTable
CREATE TABLE [dbo].[ErpTSConversation] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ErpTSConversation_id_df] DEFAULT newid(),
    [name] NVARCHAR(255),
    [isGroup] BIT NOT NULL CONSTRAINT [ErpTSConversation_isGroup_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpTSConversation_createdAt_df] DEFAULT sysutcdatetime(),
    [updatedAt] DATETIME2 NOT NULL CONSTRAINT [ErpTSConversation_updatedAt_df] DEFAULT sysutcdatetime(),
    CONSTRAINT [ErpTSConversation_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ErpTSConversationParticipant] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ErpTSConversationParticipant_id_df] DEFAULT newid(),
    [conversationId] UNIQUEIDENTIFIER NOT NULL,
    [userId] BIGINT NOT NULL,
    [joinedAt] DATETIME2 NOT NULL CONSTRAINT [ErpTSConversationParticipant_joinedAt_df] DEFAULT sysutcdatetime(),
    [lastReadAt] DATETIME2 NOT NULL CONSTRAINT [ErpTSConversationParticipant_lastReadAt_df] DEFAULT sysutcdatetime(),
    CONSTRAINT [ErpTSConversationParticipant_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ErpTSConversationParticipant_conversationId_userId_key] UNIQUE NONCLUSTERED ([conversationId],[userId])
);

-- CreateTable
CREATE TABLE [dbo].[ErpTSMessage] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ErpTSMessage_id_df] DEFAULT newid(),
    [conversationId] UNIQUEIDENTIFIER NOT NULL,
    [senderId] BIGINT NOT NULL,
    [content] NVARCHAR(max) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpTSMessage_createdAt_df] DEFAULT sysutcdatetime(),
    [updatedAt] DATETIME2 NOT NULL CONSTRAINT [ErpTSMessage_updatedAt_df] DEFAULT sysutcdatetime(),
    CONSTRAINT [ErpTSMessage_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ErpTSTaskWorkSession] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ErpTSTaskWorkSession_id_df] DEFAULT newid(),
    [taskId] UNIQUEIDENTIFIER NOT NULL,
    [designerId] BIGINT NOT NULL,
    [durationSeconds] INT NOT NULL,
    [runStartedAt] DATETIME2,
    [submissionLink] NVARCHAR(2000),
    [pauseLog] NVARCHAR(max),
    [status] NVARCHAR(50) NOT NULL CONSTRAINT [ErpTSTaskWorkSession_status_df] DEFAULT 'Submitted',
    [submittedAt] DATETIME2 NOT NULL CONSTRAINT [ErpTSTaskWorkSession_submittedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpTSTaskWorkSession_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ErpTSTaskWorkSession_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ErpTSTaskWorkSessionFile] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ErpTSTaskWorkSessionFile_id_df] DEFAULT newid(),
    [sessionId] UNIQUEIDENTIFIER NOT NULL,
    [fileKey] NVARCHAR(1024) NOT NULL,
    [fileName] NVARCHAR(255) NOT NULL,
    [mimeType] NVARCHAR(100),
    [sizeBytes] BIGINT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpTSTaskWorkSessionFile_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ErpTSTaskWorkSessionFile_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ErpTSTaskDesigner] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ErpTSTaskDesigner_id_df] DEFAULT newid(),
    [taskId] UNIQUEIDENTIFIER NOT NULL,
    [designerId] BIGINT NOT NULL,
    CONSTRAINT [ErpTSTaskDesigner_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ErpTSTaskDesigner_taskId_designerId_key] UNIQUE NONCLUSTERED ([taskId],[designerId])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ErpTSProject_createdById_idx] ON [dbo].[ErpTSProject]([createdById]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_ErpTSProjectQsAssignment_qsUserId] ON [dbo].[ErpTSProjectQsAssignment]([qsUserId], [assignedAt] DESC);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ErpTSTask_projectId_idx] ON [dbo].[ErpTSTask]([projectId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ErpTSTask_assigneeId_idx] ON [dbo].[ErpTSTask]([assigneeId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ErpTSTask_projectId_opNo_designType_revisionCode_signType_disciplineType_idx] ON [dbo].[ErpTSTask]([projectId], [opNo], [designType], [revisionCode], [signType], [disciplineType]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ErpTSRetailTaskDetail_taskId_idx] ON [dbo].[ErpTSRetailTaskDetail]([taskId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ErpTSProjectTaskDetail_taskId_idx] ON [dbo].[ErpTSProjectTaskDetail]([taskId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ErpTSProjectSignRow_projectId_idx] ON [dbo].[ErpTSProjectSignRow]([projectId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ErpTSProjectAttachment_projectId_idx] ON [dbo].[ErpTSProjectAttachment]([projectId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ErpTSProjectAttachment_createdAt_idx] ON [dbo].[ErpTSProjectAttachment]([createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ErpTSRetailTaskDetailAttachment_retailTaskDetailId_idx] ON [dbo].[ErpTSRetailTaskDetailAttachment]([retailTaskDetailId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ErpTSRetailTaskDetailAttachment_createdAt_idx] ON [dbo].[ErpTSRetailTaskDetailAttachment]([createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ErpTSProjectTaskDetailAttachment_projectTaskDetailId_idx] ON [dbo].[ErpTSProjectTaskDetailAttachment]([projectTaskDetailId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ErpTSProjectTaskDetailAttachment_createdAt_idx] ON [dbo].[ErpTSProjectTaskDetailAttachment]([createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_ErpTSChatterPost_taskId] ON [dbo].[ErpTSChatterPost]([taskId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_ErpTSChatterPost_projectId] ON [dbo].[ErpTSChatterPost]([projectId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_ErpTSChatterPost_authorId] ON [dbo].[ErpTSChatterPost]([authorId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_ErpTSChatterPost_createdAt] ON [dbo].[ErpTSChatterPost]([createdAt] DESC);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_ErpTSChatterComment_postId] ON [dbo].[ErpTSChatterComment]([postId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_ErpTSChatterPostMention_userId] ON [dbo].[ErpTSChatterPostMention]([userId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_ErpTSChatterCommentMention_userId] ON [dbo].[ErpTSChatterCommentMention]([userId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_ErpTSChatterPostSeen_userId] ON [dbo].[ErpTSChatterPostSeen]([userId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_ErpTSChatterPostSeen_postId] ON [dbo].[ErpTSChatterPostSeen]([postId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_ErpTSLeaveRequest_userId_status] ON [dbo].[ErpTSLeaveRequest]([userId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_ErpTSRegularizationRequest_designerId_status] ON [dbo].[ErpTSRegularizationRequest]([designerId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_ErpTSReallocationRequest_requesterId_status] ON [dbo].[ErpTSReallocationRequest]([requesterId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_ErpTSReallocationRequest_taskId_status] ON [dbo].[ErpTSReallocationRequest]([taskId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_ErpTSReallocationRequest_status_createdAt] ON [dbo].[ErpTSReallocationRequest]([status], [createdAt] DESC);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_ErpTSOvertimeRequest_designerId_status] ON [dbo].[ErpTSOvertimeRequest]([designerId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_ErpTSOvertimeRequest_date] ON [dbo].[ErpTSOvertimeRequest]([date]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_ErpTSOvertimeApprovalHistory_requestId] ON [dbo].[ErpTSOvertimeApprovalHistory]([requestId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_ErpTSSchedulerAssignment_week_designer] ON [dbo].[ErpTSSchedulerAssignment]([weekStartDate], [designerId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_ErpTSSchedulerAssignment_week_task] ON [dbo].[ErpTSSchedulerAssignment]([weekStartDate], [taskId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_ErpTSSchedulerAssignment_task_week] ON [dbo].[ErpTSSchedulerAssignment]([taskId], [weekStartDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ErpTSSchedulerTaskFragment_taskId_idx] ON [dbo].[ErpTSSchedulerTaskFragment]([taskId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ErpTSSchedulerAssignmentHistory_weekStartDate_idx] ON [dbo].[ErpTSSchedulerAssignmentHistory]([weekStartDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_ErpTSSchedulerAssignmentHistory_createdAt] ON [dbo].[ErpTSSchedulerAssignmentHistory]([createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_ErpTSSchedulerDayUnlock_date] ON [dbo].[ErpTSSchedulerDayUnlock]([date]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_ErpTSSchedulerDayUnlock_designerId_date] ON [dbo].[ErpTSSchedulerDayUnlock]([designerId], [date]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_ErpTSActivityLog_userId] ON [dbo].[ErpTSActivityLog]([userId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_ErpTSActivityLog_taskId] ON [dbo].[ErpTSActivityLog]([taskId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_ErpTSActivityLog_createdAt] ON [dbo].[ErpTSActivityLog]([createdAt] DESC);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ErpTSNotification_userId_createdAt_idx] ON [dbo].[ErpTSNotification]([userId], [createdAt] DESC);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ErpTSInboxRead_userId_idx] ON [dbo].[ErpTSInboxRead]([userId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_ErpTSMessage_conversationId_createdAt] ON [dbo].[ErpTSMessage]([conversationId], [createdAt] DESC);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ErpTSTaskWorkSession_taskId_idx] ON [dbo].[ErpTSTaskWorkSession]([taskId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ErpTSTaskWorkSession_designerId_idx] ON [dbo].[ErpTSTaskWorkSession]([designerId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ErpTSTaskWorkSessionFile_sessionId_idx] ON [dbo].[ErpTSTaskWorkSessionFile]([sessionId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ErpTSTaskDesigner_taskId_idx] ON [dbo].[ErpTSTaskDesigner]([taskId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ErpTSTaskDesigner_designerId_idx] ON [dbo].[ErpTSTaskDesigner]([designerId]);

-- AddForeignKey
ALTER TABLE [dbo].[ErpTSProjectQsAssignment] ADD CONSTRAINT [ErpTSProjectQsAssignment_projectId_fkey] FOREIGN KEY ([projectId]) REFERENCES [dbo].[ErpTSProject]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ErpTSProjectQsStatus] ADD CONSTRAINT [ErpTSProjectQsStatus_projectId_fkey] FOREIGN KEY ([projectId]) REFERENCES [dbo].[ErpTSProject]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ErpTSTask] ADD CONSTRAINT [ErpTSTask_projectId_fkey] FOREIGN KEY ([projectId]) REFERENCES [dbo].[ErpTSProject]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ErpTSRetailTaskDetail] ADD CONSTRAINT [ErpTSRetailTaskDetail_taskId_fkey] FOREIGN KEY ([taskId]) REFERENCES [dbo].[ErpTSTask]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ErpTSProjectTaskDetail] ADD CONSTRAINT [ErpTSProjectTaskDetail_taskId_fkey] FOREIGN KEY ([taskId]) REFERENCES [dbo].[ErpTSTask]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ErpTSProjectSignRow] ADD CONSTRAINT [ErpTSProjectSignRow_projectId_fkey] FOREIGN KEY ([projectId]) REFERENCES [dbo].[ErpTSProject]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ErpTSProjectAttachment] ADD CONSTRAINT [ErpTSProjectAttachment_projectId_fkey] FOREIGN KEY ([projectId]) REFERENCES [dbo].[ErpTSProject]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ErpTSRetailTaskDetailAttachment] ADD CONSTRAINT [ErpTSRetailTaskDetailAttachment_retailTaskDetailId_fkey] FOREIGN KEY ([retailTaskDetailId]) REFERENCES [dbo].[ErpTSRetailTaskDetail]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ErpTSProjectTaskDetailAttachment] ADD CONSTRAINT [ErpTSProjectTaskDetailAttachment_projectTaskDetailId_fkey] FOREIGN KEY ([projectTaskDetailId]) REFERENCES [dbo].[ErpTSProjectTaskDetail]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ErpTSSignageDetail] ADD CONSTRAINT [ErpTSSignageDetail_taskId_fkey] FOREIGN KEY ([taskId]) REFERENCES [dbo].[ErpTSDesignTask]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ErpTSChatterPost] ADD CONSTRAINT [ErpTSChatterPost_taskId_fkey] FOREIGN KEY ([taskId]) REFERENCES [dbo].[ErpTSTask]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ErpTSChatterPost] ADD CONSTRAINT [ErpTSChatterPost_projectId_fkey] FOREIGN KEY ([projectId]) REFERENCES [dbo].[ErpTSProject]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ErpTSChatterComment] ADD CONSTRAINT [ErpTSChatterComment_postId_fkey] FOREIGN KEY ([postId]) REFERENCES [dbo].[ErpTSChatterPost]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ErpTSChatterPostMention] ADD CONSTRAINT [ErpTSChatterPostMention_postId_fkey] FOREIGN KEY ([postId]) REFERENCES [dbo].[ErpTSChatterPost]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ErpTSChatterCommentMention] ADD CONSTRAINT [ErpTSChatterCommentMention_commentId_fkey] FOREIGN KEY ([commentId]) REFERENCES [dbo].[ErpTSChatterComment]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ErpTSChatterPostLike] ADD CONSTRAINT [ErpTSChatterPostLike_postId_fkey] FOREIGN KEY ([postId]) REFERENCES [dbo].[ErpTSChatterPost]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ErpTSChatterPostSeen] ADD CONSTRAINT [ErpTSChatterPostSeen_postId_fkey] FOREIGN KEY ([postId]) REFERENCES [dbo].[ErpTSChatterPost]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ErpTSChatterPostAttachment] ADD CONSTRAINT [ErpTSChatterPostAttachment_chatterPostId_fkey] FOREIGN KEY ([chatterPostId]) REFERENCES [dbo].[ErpTSChatterPost]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ErpTSLinkAttachment] ADD CONSTRAINT [ErpTSLinkAttachment_chatterPostId_fkey] FOREIGN KEY ([chatterPostId]) REFERENCES [dbo].[ErpTSChatterPost]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ErpTSRegularizationRequest] ADD CONSTRAINT [ErpTSRegularizationRequest_taskId_fkey] FOREIGN KEY ([taskId]) REFERENCES [dbo].[ErpTSTask]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ErpTSReallocationRequest] ADD CONSTRAINT [ErpTSReallocationRequest_taskId_fkey] FOREIGN KEY ([taskId]) REFERENCES [dbo].[ErpTSTask]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ErpTSOvertimeRequest] ADD CONSTRAINT [ErpTSOvertimeRequest_taskId_fkey] FOREIGN KEY ([taskId]) REFERENCES [dbo].[ErpTSTask]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ErpTSOvertimeApprovalHistory] ADD CONSTRAINT [ErpTSOvertimeApprovalHistory_requestId_fkey] FOREIGN KEY ([requestId]) REFERENCES [dbo].[ErpTSOvertimeRequest]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ErpTSOvertimeAttachment] ADD CONSTRAINT [ErpTSOvertimeAttachment_overtimeRequestId_fkey] FOREIGN KEY ([overtimeRequestId]) REFERENCES [dbo].[ErpTSOvertimeRequest]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ErpTSSchedulerAssignment] ADD CONSTRAINT [ErpTSSchedulerAssignment_taskId_fkey] FOREIGN KEY ([taskId]) REFERENCES [dbo].[ErpTSTask]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ErpTSSchedulerTaskFragment] ADD CONSTRAINT [ErpTSSchedulerTaskFragment_taskId_fkey] FOREIGN KEY ([taskId]) REFERENCES [dbo].[ErpTSTask]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ErpTSActivityLog] ADD CONSTRAINT [ErpTSActivityLog_taskId_fkey] FOREIGN KEY ([taskId]) REFERENCES [dbo].[ErpTSTask]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ErpTSConversationParticipant] ADD CONSTRAINT [ErpTSConversationParticipant_conversationId_fkey] FOREIGN KEY ([conversationId]) REFERENCES [dbo].[ErpTSConversation]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ErpTSMessage] ADD CONSTRAINT [ErpTSMessage_conversationId_fkey] FOREIGN KEY ([conversationId]) REFERENCES [dbo].[ErpTSConversation]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ErpTSTaskWorkSession] ADD CONSTRAINT [ErpTSTaskWorkSession_taskId_fkey] FOREIGN KEY ([taskId]) REFERENCES [dbo].[ErpTSTask]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ErpTSTaskWorkSessionFile] ADD CONSTRAINT [ErpTSTaskWorkSessionFile_sessionId_fkey] FOREIGN KEY ([sessionId]) REFERENCES [dbo].[ErpTSTaskWorkSession]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ErpTSTaskDesigner] ADD CONSTRAINT [ErpTSTaskDesigner_taskId_fkey] FOREIGN KEY ([taskId]) REFERENCES [dbo].[ErpTSTask]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

