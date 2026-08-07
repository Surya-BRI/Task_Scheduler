import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  for (const role of ['HOD', 'DESIGNER', 'SALESPERSON', 'QS']) {
    await prisma.role.upsert({
      where: { name: role },
      update: {},
      create: { name: role },
    });
  }

  const hodRole = await prisma.role.findUnique({ where: { name: 'HOD' } });
  const designerRole = await prisma.role.findUnique({ where: { name: 'DESIGNER' } });
  const salespersonRole = await prisma.role.findUnique({ where: { name: 'SALESPERSON' } });
  const qsTeamRole = await prisma.role.findUnique({ where: { name: 'QS' } });

  if (!hodRole || !designerRole || !salespersonRole || !qsTeamRole) {
    throw new Error('Required roles were not found after seeding roles');
  }

  type SeedRole = { id: string; name: string };

  const emailFromName = (fullName: string): string =>
    `${fullName
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '.')
      .replace(/[^a-z0-9.]/g, '')}@bluerhine.com`;

  // Legacy demo accounts (kept for existing E2E / local fixtures).
  const demoAccounts: Array<{ fullName: string; email: string; password: string; role: SeedRole }> = [
    { fullName: 'Sarah Mitchell', email: 'sarah.mitchell@bluerhine.com', password: 'hod123', role: hodRole },
    { fullName: 'James Carter', email: 'james.carter@bluerhine.com', password: 'hod456', role: hodRole },
    { fullName: 'Priya Sharma', email: 'priya.sharma@bluerhine.com', password: 'hod789', role: hodRole },
    { fullName: 'Alex Johnson', email: 'alex.johnson@bluerhine.com', password: 'alex123', role: designerRole },
    { fullName: 'Alexander Allen', email: 'alexander.allen@bluerhine.com', password: 'alex123', role: designerRole },
    { fullName: 'Benjamin Harris', email: 'benjamin.harris@bluerhine.com', password: 'ben123', role: designerRole },
    { fullName: 'Rehman', email: 'rehman@bluerhine.com', password: 'rehman123', role: salespersonRole },
    { fullName: 'Ojas', email: 'qs.team@bluerhine.com', password: 'qs1234', role: qsTeamRole },
  ];

  // UAT tester accounts — shared password for all roles.
  const UAT_PASSWORD = 'tester@321';
  const uatAccounts: Array<{ fullName: string; role: SeedRole }> = [
    // Sales → SALESPERSON
    { fullName: 'Sithara Sukumaran', role: salespersonRole },
    { fullName: 'Fahad', role: salespersonRole },
    // HOD
    { fullName: 'Gopan', role: hodRole },
    { fullName: 'Tony', role: hodRole },
    { fullName: 'Subin', role: hodRole },
    // Retail designers → DESIGNER
    { fullName: 'Navin Saju', role: designerRole },
    { fullName: 'Saji Saju', role: designerRole },
    { fullName: 'Amal', role: designerRole },
    { fullName: 'Alekhya', role: designerRole },
    { fullName: 'Sulakshana', role: designerRole },
    { fullName: 'Sunayana', role: designerRole },
    { fullName: 'Arjun', role: designerRole },
    { fullName: 'Sooraj', role: designerRole },
    { fullName: 'Anagha', role: designerRole },
    { fullName: 'Fougil', role: designerRole },
    { fullName: 'Ganesh', role: designerRole },
    { fullName: 'Gokul', role: designerRole },
    { fullName: 'Vipin', role: designerRole },
    { fullName: 'Ashik', role: designerRole },
    // Project designers → DESIGNER
    { fullName: 'Rajil Ravindran', role: designerRole },
    { fullName: 'Aakash Vijayan', role: designerRole },
    { fullName: 'Joseph Shilton', role: designerRole },
    // QS
    { fullName: 'Aleena', role: qsTeamRole },
    { fullName: 'Chithira', role: qsTeamRole },
    { fullName: 'Rony', role: qsTeamRole },
    { fullName: 'Sreekutty', role: qsTeamRole },
    { fullName: 'Vishun T K', role: qsTeamRole },
  ];

  for (const acc of demoAccounts) {
    const passwordHash = await bcrypt.hash(acc.password, 10);
    await prisma.user.upsert({
      where: { email: acc.email },
      update: {
        fullName: acc.fullName,
        roleId: acc.role.id,
        passwordHash,
      },
      create: {
        email: acc.email,
        fullName: acc.fullName,
        roleId: acc.role.id,
        passwordHash,
      },
    });
  }

  const uatPasswordHash = await bcrypt.hash(UAT_PASSWORD, 10);
  for (const acc of uatAccounts) {
    const email = emailFromName(acc.fullName);
    await prisma.user.upsert({
      where: { email },
      update: {
        fullName: acc.fullName,
        roleId: acc.role.id,
        passwordHash: uatPasswordHash,
      },
      create: {
        email,
        fullName: acc.fullName,
        roleId: acc.role.id,
        passwordHash: uatPasswordHash,
      },
    });
  }

  const qsUser = await prisma.user.findUnique({ where: { email: 'qs.team@bluerhine.com' } });
  const completedProject = await (async () => {
    const existing = await prisma.project.findUnique({ where: { projectNo: 'BRI-QS-COMPLETED-E2E' } });
    if (existing) return existing;
    return prisma.project.create({
      data: {
      projectNo: 'BRI-QS-COMPLETED-E2E',
      name: 'QS Completed Verification Project',
      category: 'QS_TEST',
      status: 'ACTIVE',
      salesPerson: 'QS Test Data',
      },
    });
  })();
  const completedTask = await (async () => {
    const existing = await prisma.task.findUnique({ where: { taskNo: 'TSK-QS-COMPLETED-E2E' } });
    if (existing) return existing;
    return prisma.task.create({
      data: {
      taskNo: 'TSK-QS-COMPLETED-E2E',
      projectId: completedProject.id,
      title: 'Completed QS Sign Family Verification',
      designType: 'Project',
      status: 'DESIGN_COMPLETED',
      priority: 'Low',
      },
    });
  })();
  await prisma.projectSignRow.deleteMany({ where: { projectId: completedProject.id } });
  await prisma.projectSignRow.create({
    data: {
      projectId: completedProject.id,
      tNo: 'QS-001',
      no: '1',
      signType: 'Completed Test Sign',
      planCode: 'QS-COMP-PLAN',
      estQty: 1,
      qsQty: 1,
      areaZone: 'Verification Zone',
      levelParcel: 'L1',
      sequence: 'A',
      status: 'COMPLETED',
      comment: 'Seeded completed QS verification row',
      contRef: 'QS-COMP-CONTRACT',
    },
  });

  const sqlPath = path.join(__dirname, 'sql', 'add-project-qs-assignments.sql');
  await prisma.$executeRawUnsafe(fs.readFileSync(sqlPath, 'utf8'));

  if (qsUser) {
    await prisma.$executeRaw`
      MERGE [dbo].[ErpTSProjectQsStatus] WITH (HOLDLOCK) AS [target]
      USING (SELECT ${completedProject.id} AS [projectId]) AS [source]
      ON [target].[projectId] = [source].[projectId]
      WHEN MATCHED THEN UPDATE SET
        [status] = 'Completed',
        [updatedById] = ${qsUser.id},
        [submittedById] = ${qsUser.id},
        [submittedAt] = COALESCE([target].[submittedAt], SYSUTCDATETIME()),
        [updatedAt] = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN INSERT ([projectId], [status], [updatedById], [submittedById], [submittedAt])
        VALUES (${completedProject.id}, 'Completed', ${qsUser.id}, ${qsUser.id}, SYSUTCDATETIME());
    `;
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

