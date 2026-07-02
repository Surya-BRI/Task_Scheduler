-- The ErpTSProject table was originally named "Project" and later renamed via
-- sp_rename. The rename kept the trigger attached (bound by object_id), but
-- its body text still literally referenced "dbo.Project", which no longer
-- exists as an object name. Every UPDATE on ErpTSProject was failing with
-- "Invalid object name 'dbo.Project'" (surfaced by Prisma as error P2021).
ALTER TRIGGER [dbo].[trg_Project_updatedAt] ON [dbo].[ErpTSProject]
AFTER UPDATE
AS
BEGIN
  SET NOCOUNT ON;
  UPDATE p
  SET [updatedAt] = SYSUTCDATETIME()
  FROM [dbo].[ErpTSProject] p
  INNER JOIN inserted i ON p.[id] = i.[id];
END
