import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const sqlPath = path.join(__dirname, 'sql', 'add-project-qs-assignments.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  await prisma.$executeRawUnsafe(sql);
  // eslint-disable-next-line no-console
  console.log('Project QS assignment table is ready.');
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
