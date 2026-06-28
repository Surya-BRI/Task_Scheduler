-- Migrate ErpTSProjectSignRow from task-scoped to project-scoped

-- 1. Add projectId column (nullable initially)
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.ErpTSProjectSignRow') AND name = 'projectId'
)
BEGIN
  ALTER TABLE [dbo].[ErpTSProjectSignRow] ADD [projectId] UNIQUEIDENTIFIER NULL;
END;

-- 2. Populate projectId from the linked task (dynamic SQL so it compiles after column is added)
EXEC('
  UPDATE sr
  SET sr.[projectId] = t.[projectId]
  FROM [dbo].[ErpTSProjectSignRow] sr
  INNER JOIN [dbo].[ErpTSTask] t ON t.[id] = sr.[taskId]
  WHERE sr.[projectId] IS NULL
');

-- 3. Drop old FK constraint on taskId
DECLARE @fk NVARCHAR(256);
SELECT @fk = fk.name
FROM sys.foreign_keys fk
INNER JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
INNER JOIN sys.columns c ON fkc.parent_object_id = c.object_id AND fkc.parent_column_id = c.column_id
WHERE fk.parent_object_id = OBJECT_ID('dbo.ErpTSProjectSignRow') AND c.name = 'taskId';
IF @fk IS NOT NULL
  EXEC('ALTER TABLE [dbo].[ErpTSProjectSignRow] DROP CONSTRAINT [' + @fk + ']');

-- 4. Drop any indexes on taskId (name may vary)
DECLARE @idx NVARCHAR(256);
DECLARE idx_cursor CURSOR FOR
  SELECT i.name
  FROM sys.indexes i
  INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
  INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
  WHERE i.object_id = OBJECT_ID('dbo.ErpTSProjectSignRow')
    AND c.name = 'taskId'
    AND i.is_primary_key = 0;
OPEN idx_cursor;
FETCH NEXT FROM idx_cursor INTO @idx;
WHILE @@FETCH_STATUS = 0
BEGIN
  EXEC('DROP INDEX [' + @idx + '] ON [dbo].[ErpTSProjectSignRow]');
  FETCH NEXT FROM idx_cursor INTO @idx;
END;
CLOSE idx_cursor;
DEALLOCATE idx_cursor;

-- 5. Drop taskId column
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ErpTSProjectSignRow') AND name = 'taskId')
  ALTER TABLE [dbo].[ErpTSProjectSignRow] DROP COLUMN [taskId];

-- 6. Make projectId NOT NULL
ALTER TABLE [dbo].[ErpTSProjectSignRow] ALTER COLUMN [projectId] UNIQUEIDENTIFIER NOT NULL;

-- 7. Add FK to ErpTSProject
IF NOT EXISTS (
  SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_ErpTSProjectSignRow_Project'
)
BEGIN
  ALTER TABLE [dbo].[ErpTSProjectSignRow]
    ADD CONSTRAINT [FK_ErpTSProjectSignRow_Project]
    FOREIGN KEY ([projectId]) REFERENCES [dbo].[ErpTSProject]([id]) ON DELETE CASCADE;
END;

-- 8. Add index on projectId
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.ErpTSProjectSignRow') AND name = 'ErpTSProjectSignRow_projectId_idx')
  CREATE INDEX [ErpTSProjectSignRow_projectId_idx] ON [dbo].[ErpTSProjectSignRow]([projectId]);
