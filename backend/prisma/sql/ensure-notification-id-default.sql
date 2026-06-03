-- Ensure ErpTSNotification.id auto-generates when omitted (SQL Server).
IF OBJECT_ID(N'[dbo].[ErpTSNotification]', N'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.ErpTSNotification', 'id') IS NOT NULL
  BEGIN
    DECLARE @idDefault NVARCHAR(200);
    SELECT @idDefault = dc.name
    FROM sys.default_constraints dc
    INNER JOIN sys.columns c ON c.default_object_id = dc.object_id
    INNER JOIN sys.tables t ON t.object_id = c.object_id
    WHERE t.name = 'ErpTSNotification' AND c.name = 'id';

    IF @idDefault IS NULL
    BEGIN
      ALTER TABLE [dbo].[ErpTSNotification]
        ADD CONSTRAINT [DF_ErpTSNotification_id] DEFAULT (newid()) FOR [id];
    END
  END
END
GO
