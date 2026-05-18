const { PrismaClient } = require('./backend/node_modules/@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT r.[name] AS roleName, u.[fullName]
    FROM [dbo].[ErpTSUser] u
    JOIN [dbo].[ErpTSRole] r ON r.[id] = u.[roleId]
    WHERE r.[name] IN ('DESIGNER', 'HOD')
    ORDER BY r.[name], u.[fullName]
  `);

  const grouped = { DESIGNER: [], HOD: [] };
  for (const row of rows) {
    const role = String(row.roleName).toUpperCase();
    const name = String(row.fullName || '').trim();
    if (role === 'DESIGNER') grouped.DESIGNER.push(name);
    if (role === 'HOD') grouped.HOD.push(name);
  }

  console.log(JSON.stringify(grouped, null, 2));
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
