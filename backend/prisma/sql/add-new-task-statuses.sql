-- Expand CK_Task_status to include the new design lifecycle statuses.
-- Run this against the database BEFORE deploying the updated backend.
-- Existing rows with old status values (PENDING, WIP, etc.) are unaffected.

IF EXISTS (
  SELECT 1 FROM sys.check_constraints
  WHERE name = 'CK_Task_status'
    AND parent_object_id = OBJECT_ID('dbo.ErpTSTask')
)
BEGIN
  ALTER TABLE [dbo].[ErpTSTask] DROP CONSTRAINT [CK_Task_status];
END

ALTER TABLE [dbo].[ErpTSTask] WITH CHECK ADD CONSTRAINT [CK_Task_status]
CHECK ([status] IN (
  'PENDING', 'WIP', 'COMPLETED', 'REVISION', 'APPROVED', 'ON_HOLD',
  'DESIGN_NEW', 'DESIGN_PLANNED', 'IN_PROGRESS', 'DESIGN_COMPLETED',
  'HOD_REVIEW', 'SALES_REVIEW', 'REWORK', 'REVIEW_COMPLETED', 'CLIENT_REJECTED'
));
