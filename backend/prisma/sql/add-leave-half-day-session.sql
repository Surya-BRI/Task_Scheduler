IF COL_LENGTH('dbo.ErpTSLeaveRequest', 'halfDaySession') IS NULL
BEGIN
  ALTER TABLE dbo.ErpTSLeaveRequest ADD halfDaySession NVARCHAR(50) NULL;
END
