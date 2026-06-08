IF COL_LENGTH('dbo.ErpTSLeaveRequest', 'approverId') IS NULL
BEGIN
  ALTER TABLE dbo.ErpTSLeaveRequest ADD approverId UNIQUEIDENTIFIER NULL;
END;

IF COL_LENGTH('dbo.ErpTSLeaveRequest', 'approverRemarks') IS NULL
BEGIN
  ALTER TABLE dbo.ErpTSLeaveRequest ADD approverRemarks NVARCHAR(MAX) NULL;
END;

IF COL_LENGTH('dbo.ErpTSLeaveRequest', 'reviewedAt') IS NULL
BEGIN
  ALTER TABLE dbo.ErpTSLeaveRequest ADD reviewedAt DATETIME NULL;
END;

IF COL_LENGTH('dbo.ErpTSLeaveRequest', 'id') IS NOT NULL
   AND NOT EXISTS (
     SELECT 1
     FROM sys.default_constraints dc
     INNER JOIN sys.columns c ON c.default_object_id = dc.object_id
     INNER JOIN sys.tables t ON t.object_id = c.object_id
     WHERE t.name = 'ErpTSLeaveRequest' AND c.name = 'id'
   )
BEGIN
  ALTER TABLE dbo.ErpTSLeaveRequest ADD CONSTRAINT DF_ErpTSLeaveRequest_id DEFAULT (newid()) FOR id;
END;
