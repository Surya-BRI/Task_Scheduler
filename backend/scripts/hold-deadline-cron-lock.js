/**
 * Emergency: hold TaskScheduler:DeadlineAlertsCron so an OLD remote backend
 * (same DB, pre–8AM-GST / pre-sales-scope) cannot refill overdue spam.
 * Stop with Ctrl+C after UAT is redeployed with the new deadline-alerts code.
 */
const { PrismaClient, Prisma } = require('@prisma/client');

const LOCK = 'TaskScheduler:DeadlineAlertsCron';
const HOLD_MS = Number(process.env.DEADLINE_LOCK_HOLD_MS || 6 * 60 * 60 * 1000);

const prisma = new PrismaClient();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

(async () => {
  console.log(`Holding cron lock "${LOCK}" for ${HOLD_MS}ms…`);
  await prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw`
        DECLARE @res INT;
        EXEC @res = sp_getapplock
          @Resource = ${LOCK},
          @LockMode = 'Exclusive',
          @LockOwner = 'Session',
          @LockTimeout = ${0};
        SELECT @res AS result;
      `;
      const code = rows[0]?.result ?? -1;
      if (code !== 0 && code !== 1) {
        throw new Error(`Could not acquire applock (code=${code}). Another holder may exist.`);
      }
      console.log('Lock acquired. Old remote deadline cron should skip until this process exits.');
      await sleep(HOLD_MS);
      await tx.$executeRaw`
        EXEC sp_releaseapplock @Resource = ${LOCK}, @LockOwner = 'Session';
      `;
      console.log('Lock released.');
    },
    { maxWait: 20_000, timeout: HOLD_MS + 60_000 },
  );
  await prisma.$disconnect();
})().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
