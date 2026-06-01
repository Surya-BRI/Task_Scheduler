import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const sqlPath = path.join(__dirname, 'sql', 'create-chat-tables.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  
  // Split statements if needed, but since it's a single batch, we can execute directly
  await prisma.$executeRawUnsafe(sql);
  // eslint-disable-next-line no-console
  console.log('Conversations and Chat tables are ready in database.');
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
