-- Multi-user mentions for chatter posts and comments
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ErpTSChatterPostMention')
BEGIN
  CREATE TABLE dbo.ErpTSChatterPostMention (
    id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    postId UNIQUEIDENTIFIER NOT NULL,
    userId UNIQUEIDENTIFIER NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_ErpTSChatterPostMention_post_user UNIQUE (postId, userId)
  );
  CREATE NONCLUSTERED INDEX IX_ErpTSChatterPostMention_userId
    ON dbo.ErpTSChatterPostMention (userId);
  CREATE NONCLUSTERED INDEX IX_ErpTSChatterPostMention_postId
    ON dbo.ErpTSChatterPostMention (postId);
END;

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ErpTSChatterCommentMention')
BEGIN
  CREATE TABLE dbo.ErpTSChatterCommentMention (
    id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    commentId UNIQUEIDENTIFIER NOT NULL,
    userId UNIQUEIDENTIFIER NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_ErpTSChatterCommentMention_comment_user UNIQUE (commentId, userId)
  );
  CREATE NONCLUSTERED INDEX IX_ErpTSChatterCommentMention_userId
    ON dbo.ErpTSChatterCommentMention (userId);
END;
