-- Run with: npx prisma db execute --file prisma/sql/add-regularization-review-fields.sql --schema prisma/schema.prisma
IF COL_LENGTH('dbo.ErpTSRegularizationRequest', 'approverRemarks') IS NULL
BEGIN
  ALTER TABLE dbo.ErpTSRegularizationRequest
  ADD approverRemarks NVARCHAR(MAX) NULL;
END

IF COL_LENGTH('dbo.ErpTSRegularizationRequest', 'reviewedAt') IS NULL
BEGIN
  ALTER TABLE dbo.ErpTSRegularizationRequest
  ADD reviewedAt DATETIME NULL;
END
