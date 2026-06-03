-- Run with: npx prisma db execute --file prisma/sql/add-chatter-comment-mention.sql --schema prisma/schema.prisma
IF COL_LENGTH('dbo.ErpTSChatterComment', 'mentionUserId') IS NULL
BEGIN
  ALTER TABLE dbo.ErpTSChatterComment
  ADD mentionUserId UNIQUEIDENTIFIER NULL;
END