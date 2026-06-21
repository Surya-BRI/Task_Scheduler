-- Migrate REVIEW_COMPLETED → CLIENT_ACCEPTED

-- Step 1: drop the existing CHECK constraint on ErpTSTask.status
DECLARE @constraintName NVARCHAR(256);

SELECT @constraintName = cc.name
FROM sys.check_constraints cc
JOIN sys.columns col ON cc.parent_object_id = col.object_id
                     AND cc.parent_column_id = col.column_id
WHERE OBJECT_NAME(cc.parent_object_id) = 'ErpTSTask'
  AND col.name = 'status';

IF @constraintName IS NOT NULL
BEGIN
  EXEC('ALTER TABLE ErpTSTask DROP CONSTRAINT [' + @constraintName + ']');
END

-- Step 2: migrate the data (must happen before constraint is re-added)
UPDATE ErpTSTask
SET status = 'CLIENT_ACCEPTED'
WHERE status = 'REVIEW_COMPLETED';

-- Step 3: recreate the constraint with CLIENT_ACCEPTED in the allowed list
ALTER TABLE ErpTSTask
  ADD CONSTRAINT CK_Task_status CHECK (status IN (
    'DESIGN_NEW', 'DESIGN_PLANNED', 'IN_PROGRESS', 'DESIGN_COMPLETED',
    'HOD_REVIEW', 'SALES_REVIEW', 'REWORK',
    'CLIENT_ACCEPTED', 'CLIENT_REJECTED',
    'ON_HOLD',
    'PENDING', 'WIP', 'REVISION', 'COMPLETED', 'APPROVED'
  ));
