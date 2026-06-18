-- Track which users have viewed each chatter post (distinct from likes)
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ErpTSChatterPostSeen')
BEGIN
  CREATE TABLE dbo.ErpTSChatterPostSeen (
    id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    postId UNIQUEIDENTIFIER NOT NULL,
    userId UNIQUEIDENTIFIER NOT NULL,
    seenAt DATETIME NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_ErpTSChatterPostSeen_post_user UNIQUE (postId, userId)
  );
  CREATE NONCLUSTERED INDEX IX_ErpTSChatterPostSeen_userId
    ON dbo.ErpTSChatterPostSeen (userId);
  CREATE NONCLUSTERED INDEX IX_ErpTSChatterPostSeen_postId
    ON dbo.ErpTSChatterPostSeen (postId);
END;
