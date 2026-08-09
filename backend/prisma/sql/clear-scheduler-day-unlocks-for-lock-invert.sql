-- Invert ErpTSSchedulerDayUnlock semantics (2026-08):
--   BEFORE: row = weekend UNLOCKED (open for manual place; weekends locked by default)
--   AFTER:  row = weekend LOCKED (skip day; weekends open by default like weekdays)
--
-- Old unlock rows meant "allow scheduling" which is now the default. Keeping them would
-- incorrectly treat previously-unlocked days as locked. Clear all rows on deploy.
--
-- Run once against production/staging before shipping the day-locks API cutover.
-- Safe to re-run (idempotent DELETE).

DELETE FROM dbo.ErpTSSchedulerDayUnlock;
