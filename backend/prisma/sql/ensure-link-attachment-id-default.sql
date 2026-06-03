-- ErpTSLinkAttachment.id must default to newid() for Prisma nested creates (SQL Server).
IF OBJECT_ID(N'[dbo].[ErpTSLinkAttachment]', N'U') IS NOT NULL
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM sys.default_constraints dc
    INNER JOIN sys.columns c ON c.default_object_id = dc.object_id
    INNER JOIN sys.tables t ON t.object_id = c.object_id
    WHERE t.name = N'ErpTSLinkAttachment' AND c.name = N'id'
  )
  BEGIN
    ALTER TABLE [dbo].[ErpTSLinkAttachment]
    ADD CONSTRAINT [DF_ErpTSLinkAttachment_id] DEFAULT (newid()) FOR [id];
  END
END
