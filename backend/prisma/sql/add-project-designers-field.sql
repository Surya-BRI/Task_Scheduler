-- Adds the designers column to ErpTSProject so a project team can carry a
-- comma-separated list of assigned designers, mirroring ErpTSTask.designers.
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.ErpTSProject') AND name = 'designers'
)
BEGIN
    ALTER TABLE [dbo].[ErpTSProject] ADD [designers] NVARCHAR(MAX) NULL;
END
