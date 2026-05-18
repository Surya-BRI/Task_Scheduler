const { PrismaClient } = require('./backend/node_modules/@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT r.[name] AS roleName, COUNT(1) AS total
    FROM [dbo].[ErpTSUser] u
    JOIN [dbo].[ErpTSRole] r ON r.[id] = u.[roleId]
    GROUP BY r.[name]
    ORDER BY r.[name]
  `);
  const map = Object.fromEntries(rows.map((r) => [String(r.roleName).toUpperCase(), Number(r.total)]));
  console.log(JSON.stringify({ DESIGNER: map.DESIGNER || 0, HOD: map.HOD || 0, ALL_ROLES: map }, null, 2));
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
