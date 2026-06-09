-- HOD revocation audit fields for approved leave requests
IF COL_LENGTH('dbo.ErpTSLeaveRequest', 'revokedById') IS NULL
BEGIN
  ALTER TABLE dbo.ErpTSLeaveRequest ADD revokedById UNIQUEIDENTIFIER NULL;
END;

IF COL_LENGTH('dbo.ErpTSLeaveRequest', 'revokedAt') IS NULL
BEGIN
  ALTER TABLE dbo.ErpTSLeaveRequest ADD revokedAt DATETIME NULL;
END;

IF COL_LENGTH('dbo.ErpTSLeaveRequest', 'revocationReason') IS NULL
BEGIN
  ALTER TABLE dbo.ErpTSLeaveRequest ADD revocationReason NVARCHAR(MAX) NULL;
END;
