import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const tables = await prisma.$queryRaw<
    Array<{ TABLE_NAME: string }>
  >`
    SELECT TABLE_NAME
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME LIKE 'ErpTS%'
    ORDER BY TABLE_NAME`;

  // eslint-disable-next-line no-console
  console.log('ErpTS tables:', tables.map((t) => t.TABLE_NAME).join(', '));

  const fks = await prisma.$queryRaw<
    Array<{
      fk_name: string;
      parent_table: string;
      parent_column: string;
      referenced_table: string;
      referenced_column: string;
    }>
  >`
    SELECT
      fk.name AS fk_name,
      OBJECT_NAME(fk.parent_object_id) AS parent_table,
      pc.name AS parent_column,
      OBJECT_NAME(fk.referenced_object_id) AS referenced_table,
      rc.name AS referenced_column
    FROM sys.foreign_keys fk
    INNER JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
    INNER JOIN sys.columns pc ON fkc.parent_object_id = pc.object_id AND fkc.parent_column_id = pc.column_id
    INNER JOIN sys.columns rc ON fkc.referenced_object_id = rc.object_id AND fkc.referenced_column_id = rc.column_id
    WHERE OBJECT_NAME(fk.parent_object_id) LIKE 'ErpTS%'
    ORDER BY parent_table, fk_name`;

  // eslint-disable-next-line no-console
  console.log('\nExisting ErpTS foreign keys:');
  for (const row of fks) {
    // eslint-disable-next-line no-console
    console.log(`  ${row.parent_table}.${row.parent_column} -> ${row.referenced_table}.${row.referenced_column} (${row.fk_name})`);
  }

  const orphans = await prisma.$queryRaw<
    Array<{ check_name: string; orphan_count: number }>
  >`
    SELECT 'ChatterPost.taskId' AS check_name, COUNT(*) AS orphan_count
    FROM [dbo].[ErpTSChatterPost] c
    LEFT JOIN [dbo].[ErpTSTask] t ON c.taskId = t.id
    WHERE c.taskId IS NOT NULL AND t.id IS NULL
    UNION ALL
    SELECT 'ChatterPost.authorId', COUNT(*)
    FROM [dbo].[ErpTSChatterPost] c
    LEFT JOIN [dbo].[ErpTSUser] u ON c.authorId = u.id
    WHERE c.authorId IS NOT NULL AND u.id IS NULL
    UNION ALL
    SELECT 'ChatterPost.mentionUserId', COUNT(*)
    FROM [dbo].[ErpTSChatterPost] c
    LEFT JOIN [dbo].[ErpTSUser] u ON c.mentionUserId = u.id
    WHERE c.mentionUserId IS NOT NULL AND u.id IS NULL
    UNION ALL
    SELECT 'ChatterPostAttachment.chatterPostId', COUNT(*)
    FROM [dbo].[ErpTSChatterPostAttachment] a
    LEFT JOIN [dbo].[ErpTSChatterPost] p ON a.chatterPostId = p.id
    WHERE p.id IS NULL
    UNION ALL
    SELECT 'LeaveRequest.userId', COUNT(*)
    FROM [dbo].[ErpTSLeaveRequest] lr
    LEFT JOIN [dbo].[ErpTSUser] u ON TRY_CAST(lr.userId AS uniqueidentifier) = u.id
    WHERE lr.userId IS NOT NULL AND u.id IS NULL
    UNION ALL
    SELECT 'Notification.userId', COUNT(*)
    FROM [dbo].[ErpTSNotification] n
    LEFT JOIN [dbo].[ErpTSUser] u ON TRY_CAST(n.userId AS uniqueidentifier) = u.id
    WHERE n.userId IS NOT NULL AND u.id IS NULL
    UNION ALL
    SELECT 'Regularization.designerId', COUNT(*)
    FROM [dbo].[ErpTSRegularizationRequest] r
    LEFT JOIN [dbo].[ErpTSUser] u ON r.designerId = u.id
    WHERE r.designerId IS NOT NULL AND u.id IS NULL
    UNION ALL
    SELECT 'Regularization.taskId', COUNT(*)
    FROM [dbo].[ErpTSRegularizationRequest] r
    LEFT JOIN [dbo].[ErpTSTask] t ON r.taskId = t.id
    WHERE r.taskId IS NOT NULL AND t.id IS NULL
    UNION ALL
    SELECT 'Overtime.designerId', COUNT(*)
    FROM [dbo].[ErpTSOvertimeRequest] o
    LEFT JOIN [dbo].[ErpTSUser] u ON o.designerId = u.id
    WHERE o.designerId IS NOT NULL AND u.id IS NULL
    UNION ALL
    SELECT 'Overtime.taskId', COUNT(*)
    FROM [dbo].[ErpTSOvertimeRequest] o
    LEFT JOIN [dbo].[ErpTSTask] t ON o.taskId = t.id
    WHERE o.taskId IS NOT NULL AND t.id IS NULL
    UNION ALL
    SELECT 'SchedulerAssignment.designerId', COUNT(*)
    FROM [dbo].[ErpTSSchedulerAssignment] s
    LEFT JOIN [dbo].[ErpTSUser] u ON TRY_CAST(s.designerId AS uniqueidentifier) = u.id
    WHERE s.designerId IS NOT NULL AND u.id IS NULL
    UNION ALL
    SELECT 'SchedulerAssignment.taskId', COUNT(*)
    FROM [dbo].[ErpTSSchedulerAssignment] s
    LEFT JOIN [dbo].[ErpTSTask] t ON TRY_CAST(s.taskId AS uniqueidentifier) = t.id
    WHERE s.taskId IS NOT NULL AND t.id IS NULL`;

  // eslint-disable-next-line no-console
  console.log('\nOrphan checks (must be 0 before FKs):');
  for (const row of orphans) {
    // eslint-disable-next-line no-console
    console.log(`  ${row.check_name}: ${row.orphan_count}`);
  }

  const colTypes = await prisma.$queryRaw<
    Array<{ TABLE_NAME: string; COLUMN_NAME: string; DATA_TYPE: string }>
  >`
    SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME IN (
      'ErpTSLeaveRequest', 'ErpTSNotification', 'ErpTSLinkAttachment',
      'ErpTSChatterPostAttachment', 'Department', 'ErpTSDepartment'
    )
    AND COLUMN_NAME IN ('id', 'userId', 'chatterPostId', 'uploadedById')
    ORDER BY TABLE_NAME, COLUMN_NAME`;

  // eslint-disable-next-line no-console
  console.log('\nKey column types:');
  for (const c of colTypes) {
    // eslint-disable-next-line no-console
    console.log(`  ${c.TABLE_NAME}.${c.COLUMN_NAME}: ${c.DATA_TYPE}`);
  }

  const badUuids = await prisma.$queryRaw<Array<{ source: string; cnt: number }>>`
    SELECT 'LeaveRequest.userId' AS source, COUNT(*) AS cnt
    FROM [dbo].[ErpTSLeaveRequest]
    WHERE userId IS NOT NULL AND TRY_CAST(userId AS uniqueidentifier) IS NULL
    UNION ALL
    SELECT 'Notification.userId', COUNT(*)
    FROM [dbo].[ErpTSNotification]
    WHERE userId IS NOT NULL AND TRY_CAST(userId AS uniqueidentifier) IS NULL
    UNION ALL
    SELECT 'LinkAttachment.chatterPostId', COUNT(*)
    FROM [dbo].[ErpTSLinkAttachment]
    WHERE chatterPostId IS NOT NULL AND TRY_CAST(chatterPostId AS uniqueidentifier) IS NULL`;

  // eslint-disable-next-line no-console
  console.log('\nNon-UUID values in reference columns:');
  for (const row of badUuids) {
    // eslint-disable-next-line no-console
    console.log(`  ${row.source}: ${row.cnt}`);
  }
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
