-- READ-ONLY diagnostic: run this BEFORE the fix migration.
-- Shows current state of all 4 chatter junction tables and how many posts/mentions will be affected.

-- 1. Row counts in the 4 junction tables (expected: all 0 due to insert failures)
SELECT 'ErpTSChatterPostSeen'       AS TableName, COUNT(*) AS TotalRows FROM dbo.ErpTSChatterPostSeen
UNION ALL
SELECT 'ErpTSChatterPostMention'    AS TableName, COUNT(*) AS TotalRows FROM dbo.ErpTSChatterPostMention
UNION ALL
SELECT 'ErpTSChatterCommentMention' AS TableName, COUNT(*) AS TotalRows FROM dbo.ErpTSChatterCommentMention
UNION ALL
SELECT 'ErpTSChatterPostLike'       AS TableName, COUNT(*) AS TotalRows FROM dbo.ErpTSChatterPostLike;

-- 2. Current userId column type in each table
SELECT
  t.name AS TableName,
  c.name AS ColumnName,
  tp.name AS DataType
FROM sys.tables t
INNER JOIN sys.columns c ON c.object_id = t.object_id
INNER JOIN sys.types tp ON tp.user_type_id = c.user_type_id
WHERE t.name IN ('ErpTSChatterPostSeen','ErpTSChatterPostMention','ErpTSChatterCommentMention','ErpTSChatterPostLike')
  AND c.name = 'userId'
ORDER BY t.name;

-- 3. How many posts exist total vs how many have seenByCount > 0 (stale column data)
SELECT
  COUNT(*)                             AS TotalPosts,
  SUM(CASE WHEN seenByCount > 0 THEN 1 ELSE 0 END) AS PostsWithStaleSeenCount
FROM dbo.ErpTSChatterPost;

-- 4. How many posts have a single mentionUserId set (will be back-filled after migration)
SELECT COUNT(*) AS PostsWithMentionToBackfill
FROM dbo.ErpTSChatterPost
WHERE mentionUserId IS NOT NULL;

-- 5. How many comments have a single mentionUserId set (will be back-filled after migration)
SELECT COUNT(*) AS CommentsWithMentionToBackfill
FROM dbo.ErpTSChatterComment
WHERE mentionUserId IS NOT NULL;
