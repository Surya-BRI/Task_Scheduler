-- Adds salesForceCode to ErpTSProject so a project can be hydrated from an
-- ErpMasterOpportunity that has no linked ErpMasterProject yet (projectNo stays
-- null in that case).
--
-- Both projectNo and salesForceCode need a FILTERED unique index (WHERE ... IS NOT NULL),
-- not a plain UNIQUE constraint: SQL Server's plain UNIQUE only allows a single NULL row,
-- and every OP-code-only project has projectNo = NULL, so a second one would violate the
-- original ErpTSProject_projectNo_key constraint. No FK references projectNo (only `id`),
-- so it's safe to swap.
-- GO batch separators are required: a CREATE INDEX referencing a column added by an
-- ALTER TABLE earlier in the same batch fails with "Invalid column name" otherwise.

IF EXISTS (
    SELECT 1 FROM sys.key_constraints
    WHERE parent_object_id = OBJECT_ID('dbo.ErpTSProject') AND name = 'ErpTSProject_projectNo_key'
)
BEGIN
    ALTER TABLE [dbo].[ErpTSProject] DROP CONSTRAINT [ErpTSProject_projectNo_key];
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.ErpTSProject') AND name = 'UQ_ErpTSProject_projectNo'
)
BEGIN
    CREATE UNIQUE INDEX [UQ_ErpTSProject_projectNo] ON [dbo].[ErpTSProject]([projectNo]) WHERE [projectNo] IS NOT NULL;
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.ErpTSProject') AND name = 'salesForceCode'
)
BEGIN
    ALTER TABLE [dbo].[ErpTSProject] ADD [salesForceCode] NVARCHAR(64) NULL;
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.ErpTSProject') AND name = 'UQ_ErpTSProject_salesForceCode'
)
BEGIN
    CREATE UNIQUE INDEX [UQ_ErpTSProject_salesForceCode] ON [dbo].[ErpTSProject]([salesForceCode]) WHERE [salesForceCode] IS NOT NULL;
END
GO
