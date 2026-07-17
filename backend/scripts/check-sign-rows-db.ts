import { PrismaClient } from '@prisma/client';

const json = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? Number(x) : x), 2);

async function main() {
  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
    console.log('DB connection: OK');

    const total = await prisma.projectSignRow.count();
    console.log('Total rows in ErpTSProjectSignRow:', total);

    const byProject = await prisma.$queryRaw<
      Array<{ projectId: string; projectNo: string | null; name: string | null; rows: number }>
    >`
      SELECT TOP 10 sr.projectId, p.projectNo, p.name, COUNT(*) AS rows
      FROM ErpTSProjectSignRow sr
      LEFT JOIN ErpTSProject p ON p.id = sr.projectId
      GROUP BY sr.projectId, p.projectNo, p.name
      ORDER BY COUNT(*) DESC
    `;
    console.log('Top projects with sign rows:', json(byProject));
  } catch (err) {
    console.error('DB check FAILED:', err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
