-- Creates ErpTSSchedulerDayUnlock for HOD per-designer weekend (Sat/Sun) unlocks.
-- Safe to run multiple times (IF NOT EXISTS guard).
-- Run with: npx prisma db execute --file prisma/sql/create-scheduler-day-unlock.sql --schema prisma/schema.prisma

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ErpTSSchedulerDayUnlock')
BEGIN
  CREATE TABLE dbo.ErpTSSchedulerDayUnlock (
    id            UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_ErpTSSchedulerDayUnlock PRIMARY KEY DEFAULT NEWID(),
    designerId    UNIQUEIDENTIFIER NOT NULL,
    [date]        DATE             NOT NULL,
    unlockedById  UNIQUEIDENTIFIER NOT NULL,
    reason        NVARCHAR(500)    NULL,
    createdAt     DATETIME2        NOT NULL CONSTRAINT DF_ErpTSSchedulerDayUnlock_createdAt DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT FK_ErpTSSchedulerDayUnlock_Designer FOREIGN KEY (designerId) REFERENCES dbo.ErpTSUser(id),
    CONSTRAINT FK_ErpTSSchedulerDayUnlock_UnlockedBy FOREIGN KEY (unlockedById) REFERENCES dbo.ErpTSUser(id),
    CONSTRAINT UQ_ErpTSSchedulerDayUnlock_designer_date UNIQUE (designerId, [date])
  );

  CREATE INDEX IX_ErpTSSchedulerDayUnlock_date
    ON dbo.ErpTSSchedulerDayUnlock ([date]);
  CREATE INDEX IX_ErpTSSchedulerDayUnlock_designerId_date
    ON dbo.ErpTSSchedulerDayUnlock (designerId, [date]);
END
