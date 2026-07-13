-- Clear stale timer flags left on draft work sessions (safe to re-run).
-- Run once if designers are blocked from starting despite all timers appearing paused.

UPDATE [dbo].[ErpTSTaskWorkSession]
SET    [runStartedAt] = NULL
WHERE  [status] = 'Draft'
  AND  [runStartedAt] IS NOT NULL;

SELECT [taskId], [designerId], [runStartedAt], [createdAt]
FROM   [dbo].[ErpTSTaskWorkSession]
WHERE  [status] = 'Draft'
ORDER  BY [createdAt] DESC;
