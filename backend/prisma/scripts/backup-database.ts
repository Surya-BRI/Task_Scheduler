/**
 * Prints a SQL Server BACKUP DATABASE statement for pre-deploy snapshots.
 * Usage: tsx prisma/scripts/backup-database.ts --server HOST --database DBNAME
 */
import * as process from 'process';

function parseArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

const server = parseArg('--server') ?? process.env.DB_SERVER;
const database = parseArg('--database') ?? process.env.DB_NAME;

if (!server || !database) {
  console.error('Usage: tsx prisma/scripts/backup-database.ts --server HOST --database DBNAME');
  console.error('Or set DB_SERVER and DB_NAME environment variables.');
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const path = `D:\\SQLBackups\\TaskScheduler\\pre_deploy_${stamp}.bak`;

console.log(`-- Run on SQL Server ${server}`);
console.log(`BACKUP DATABASE [${database}]`);
console.log(`TO DISK = N'${path}'`);
console.log(`WITH COMPRESSION, CHECKSUM, STATS = 10;`);
