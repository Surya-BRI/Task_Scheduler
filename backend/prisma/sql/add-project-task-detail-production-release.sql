IF COL_LENGTH('ErpTSProjectTaskDetail', 'productionRelease') IS NULL
BEGIN
  ALTER TABLE ErpTSProjectTaskDetail ADD productionRelease BIT NULL CONSTRAINT DF_ErpTSProjectTaskDetail_productionRelease DEFAULT (0);
END;

IF COL_LENGTH('ErpTSProjectTaskDetail', 'productionReleaseHours') IS NULL
BEGIN
  ALTER TABLE ErpTSProjectTaskDetail ADD productionReleaseHours INT NULL;
END;
