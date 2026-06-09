-- Speed up notification list/count by user (Navbar polling).
IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'ErpTSNotification_userId_createdAt_idx'
    AND object_id = OBJECT_ID('dbo.ErpTSNotification')
)
BEGIN
  CREATE NONCLUSTERED INDEX [ErpTSNotification_userId_createdAt_idx]
    ON [dbo].[ErpTSNotification] ([userId], [createdAt] DESC);
END;
