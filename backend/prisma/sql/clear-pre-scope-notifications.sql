-- Clear inbox rows created before sales-scoped notifies + 08:00 GST overdue gating.
-- Old broadcasts (every salesperson / every-5-min overdue) stay in ErpTSNotification
-- until removed; wipe so users start from an empty inbox under the new rules.
--
-- Run once against staging/production after deploying the notification scoping changes.
-- Safe to re-run (idempotent DELETE of all rows).

DELETE FROM dbo.ErpTSNotification;
