const { PrismaClient } = require('./backend/node_modules/@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const rows = await prisma.$queryRawUnsafe("SELECT cc.name, cc.definition FROM sys.check_constraints cc WHERE cc.name='CK_Task_status'");
  console.log(JSON.stringify(rows, null, 2));
  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
