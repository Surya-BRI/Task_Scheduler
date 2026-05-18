const { PrismaClient } = require('./backend/node_modules/@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const invalidRows = await prisma.$queryRawUnsafe(`
    SELECT COUNT(1) AS invalidCount
    FROM [dbo].[ErpTSTask]
    WHERE [status] IS NOT NULL
      AND [status] NOT IN ('PENDING','WIP','COMPLETED','REVISION','APPROVED','ON_HOLD')
  `);
  console.log('Invalid rows check:', invalidRows);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE [dbo].[ErpTSTask] DROP CONSTRAINT [CK_Task_status];
    ALTER TABLE [dbo].[ErpTSTask] WITH CHECK ADD CONSTRAINT [CK_Task_status]
    CHECK ([status] IN ('PENDING','WIP','COMPLETED','REVISION','APPROVED','ON_HOLD'));
  `);

  const rows = await prisma.$queryRawUnsafe(`SELECT cc.name, cc.definition FROM sys.check_constraints cc WHERE cc.name='CK_Task_status'`);
  console.log('Updated constraint:', rows);
  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
