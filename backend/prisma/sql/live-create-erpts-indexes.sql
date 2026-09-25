-- One Pending reallocation request per (taskId, requesterId). Prisma can't express a filtered
-- unique index, so it lives here (see add-reallocation-pending-unique.sql).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_ErpTSReallocationRequest_pending_task_requester' AND object_id = OBJECT_ID(N'dbo.ErpTSReallocationRequest'))
  CREATE UNIQUE INDEX UQ_ErpTSReallocationRequest_pending_task_requester
    ON dbo.ErpTSReallocationRequest (taskId, requesterId) WHERE status = N'Pending';
