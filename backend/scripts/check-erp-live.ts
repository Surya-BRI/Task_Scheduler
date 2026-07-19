import { PrismaClient } from '@prisma/client';

const json = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? Number(x) : x), 2);

async function main() {
  const url = process.env.CHECK_LIVE_URL;
  if (!url) throw new Error('Set CHECK_LIVE_URL');
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    await prisma.$connect();
    console.log('ERP-Live connection: OK');

    const latest = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT TOP 3 mp.projectCode, mp.projectName, mp.createdOn
      FROM ErpMasterProject mp
      ORDER BY mp.createdOn DESC
    `;
    console.log('Latest ERP master projects:', json(latest));

    const j29382 = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT TOP 3 mp.projectCode, mo.salesForceCode
      FROM ErpMasterProject mp
      LEFT JOIN ErpMasterOpportunity mo ON mo.projectid = mp.projectid
      WHERE LOWER(REPLACE(REPLACE(mp.projectCode, ' ', ''), '-', '')) LIKE '%j29382%'
    `;
    console.log('J29382 in ERP-Live:', json(j29382));

    const code = String(j29382[0]?.salesForceCode ?? '').trim();
    if (code) {
      const signTypes = await prisma.$queryRaw<Array<Record<string, unknown>>>`
        SELECT es.signCode, es.quantity, mttt.taxnomyName AS signfamily, ess.taxnomyName AS estimationStatus
        FROM ErpMasterOpportunity mo
        INNER JOIN ErpEstimationOpportunity eo
          ON LTRIM(RTRIM(eo.sfop)) = LTRIM(RTRIM(mo.salesForceCode))
        INNER JOIN ErpEstimationProject ee ON eo.estimationopid = ee.estimationOpId
        INNER JOIN ErpEstimationProjectSignType es ON es.estimationId = ee.estimationId
        INNER JOIN ErpMasterTaxnomy ess
          ON ess.taxnomyId = ee.statusId
          AND ess.taxnomyCode = 'Approved'
          AND ess.taxnomyType = 'EstimationStatus'
        LEFT JOIN ErpMasterTaxnomy mttt ON es.signFmilyId = mttt.taxnomyId
        WHERE LTRIM(RTRIM(mo.salesForceCode)) = ${code}
      `;
      console.log(`Approved sign types for ${code}:`, json(signTypes));
    }
  } catch (err) {
    console.error('ERP-Live check FAILED:', err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
