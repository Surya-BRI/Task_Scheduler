-- Adds ErpTSTask.designCompletedAt — the date the designer actually finished the design
-- (task entered DESIGN_COMPLETED). Unlike completedAt it is never overwritten by the later
-- CLIENT_ACCEPTED / CLIENT_REJECTED step. Drives the scheduler's "completed on" day.
--
-- Idempotent. Run against ERP-Live BEFORE deploying the backend that selects this column
-- (Prisma selects it on every task read, so old DB + new code = 500s).
--
-- ErpTSTask has a filtered unique index, so the UPDATE needs QUOTED_IDENTIFIER ON
-- (sqlcmd defaults it OFF unless run with -I).

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('ErpTSTask') AND name = 'designCompletedAt'
)
BEGIN
  ALTER TABLE ErpTSTask
    ADD designCompletedAt DATETIME2 NULL;
END
GO

SET QUOTED_IDENTIFIER ON;
GO

-- Backfill tasks that are already past the design step: use the designer's latest submitted
-- work session, falling back to completedAt. Only fills rows that are still NULL.
UPDATE t
SET designCompletedAt = COALESCE(ws.lastSubmittedAt, t.completedAt)
FROM ErpTSTask t
OUTER APPLY (
  SELECT MAX(s.submittedAt) AS lastSubmittedAt
  FROM ErpTSTaskWorkSession s
  WHERE s.taskId = t.id AND s.status = 'Submitted'
) ws
WHERE t.designCompletedAt IS NULL
  AND t.status IN ('DESIGN_COMPLETED', 'HOD_REVIEW', 'SALES_REVIEW', 'CLIENT_ACCEPTED', 'CLIENT_REJECTED')
  AND COALESCE(ws.lastSubmittedAt, t.completedAt) IS NOT NULL;
GO
