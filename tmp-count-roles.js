const { PrismaClient } = require('./backend/node_modules/@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const grouped = await prisma.user.groupBy({
    by: ['role'],
    _count: { role: true },
  });
  const map = Object.fromEntries(grouped.map((r) => [r.role, r._count.role]));
  console.log(JSON.stringify({ DESIGNER: map.DESIGNER || 0, HOD: map.HOD || 0, ALL_ROLES: map }, null, 2));
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
