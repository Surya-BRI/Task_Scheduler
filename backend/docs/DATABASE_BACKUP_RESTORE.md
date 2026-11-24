# SQL Server Backup and Restore Runbook

This document defines the backup strategy for the Task Scheduler SQL Server database (`ErpTS*` tables).

> **Since 2026-09-25 the `ErpTS*` tables live inside ERP-Live** (FULL recovery model), so they are backed up by ERP-Live's own backup job, not a separate Scheduler database. Whether that job covers the new tables is still to be confirmed (`PRODUCTION_MIGRATION_PROGRESS.md` open item 7). The schedule below is the target policy.

## Objectives

| Metric | Target |
|--------|--------|
| RPO (Recovery Point Objective) | 24 hours (daily full backup) + 15 minutes (transaction log backups in production) |
| RTO (Recovery Time Objective) | 4 hours |

## Backup schedule (production)

### Full backup — daily

Run during a low-traffic window (e.g. 02:00 UTC):

```sql
BACKUP DATABASE [YourDatabaseName]
TO DISK = N'D:\SQLBackups\TaskScheduler\full_YYYYMMDD.bak'
WITH COMPRESSION, CHECKSUM, STATS = 10;
```

### Transaction log backup — every 15 minutes (production only)

Requires database in **FULL** recovery model:

```sql
BACKUP LOG [YourDatabaseName]
TO DISK = N'D:\SQLBackups\TaskScheduler\log_YYYYMMDD_HHMM.trn'
WITH COMPRESSION, CHECKSUM, STATS = 5;
```

### Retention

| Backup type | Retention |
|-------------|-----------|
| Full | 30 days on disk, 90 days in off-site storage |
| Transaction log | 7 days |

## Pre-deploy backup

Before every production deployment or migration:

```bash
# From ops host with sqlcmd access
sqlcmd -S $DB_SERVER -d $DB_NAME -Q "BACKUP DATABASE [$DB_NAME] TO DISK = N'/backups/pre_deploy_$(date +%Y%m%d_%H%M).bak' WITH COMPRESSION, CHECKSUM"
```

Or use the helper script:

```bash
cd backend
npm run prisma:backup:script -- --server $DB_SERVER --database $DB_NAME
```

## Restore testing (monthly)

1. Restore the latest full backup to a **non-production** SQL Server instance.
2. Apply transaction log backups to a known point in time.
3. Run application smoke tests against the restored database:

```bash
DATABASE_URL="sqlserver://..." npm run prisma:audit-schema --workspace backend
npm test --workspace backend
```

4. Record restore duration and any errors in the ops log.

## Point-in-time restore

```sql
-- 1. Restore full backup WITH NORECOVERY
RESTORE DATABASE [TaskScheduler_Restore]
FROM DISK = N'D:\SQLBackups\TaskScheduler\full_20250703.bak'
WITH NORECOVERY, REPLACE, MOVE 'YourDataFile' TO 'D:\Data\TaskScheduler_Restore.mdf',
     MOVE 'YourLogFile' TO 'D:\Data\TaskScheduler_Restore_log.ldf';

-- 2. Restore log backups up to target time
RESTORE LOG [TaskScheduler_Restore]
FROM DISK = N'D:\SQLBackups\TaskScheduler\log_20250703_1400.trn'
WITH NORECOVERY, STOPAT = '2025-07-03T14:30:00';

-- 3. Bring online
RESTORE DATABASE [TaskScheduler_Restore] WITH RECOVERY;
```

## Application-level data protection

- Scheduler week snapshots (`ErpTSSchedulerAssignmentHistory`) provide audit trail for assignment changes.
- Leave reschedule snapshots (`ErpTSLeaveRescheduleSnapshot`) allow scheduler rollback on leave revocation.
- Schema history is the SQL in `backend/prisma/sql/` (version-controlled); `backend/prisma/migrations/` is empty.

## Disaster recovery checklist

1. Provision replacement SQL Server instance.
2. Restore latest full + log backups of ERP-Live (the `ErpTS*` tables come back with it).
3. If restoring onto an empty database instead, create the schema with `backend/prisma/sql/live-create-erpts-tables.sql` and `live-create-erpts-indexes.sql` (`sqlcmd -I`), then any later `prisma/sql/*.sql` changes.
4. Run `npm run prisma:audit-schema --workspace backend` to check ErpTS tables / FKs.
5. Deploy application with `RUNTIME_SCHEMA_BOOTSTRAP=false`.
6. Verify `/health/ready` and the ERP-portal login flow.

## Related commands

```bash
npm run prisma:audit-schema     # ErpTS tables / FK / orphan audit
# Legacy — do not run against ERP-Live (references retired ErpTSUser):
# npm run deploy:bootstrap / prisma:setup / prisma:migrate:deploy
```
