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

  const demoAccounts = [
    { fullName: 'Sarah Mitchell', email: 'sarah.mitchell@bluerhine.com', password: 'hod123', role: hodRole },
    { fullName: 'Alex Johnson', email: 'alex.johnson@bluerhine.com', password: 'alex123', role: designerRole },
    { fullName: 'Alexander Allen', email: 'alexander.allen@bluerhine.com', password: 'alex123', role: designerRole },
    { fullName: 'Benjamin Harris', email: 'benjamin.harris@bluerhine.com', password: 'ben123', role: designerRole },
    { fullName: 'Rehman', email: 'rehman@bluerhine.com', password: 'rehman123', role: salespersonRole },
    { fullName: 'Ojas', email: 'qs.team@bluerhine.com', password: 'qs1234', role: qsTeamRole },
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

  const qsUser = await prisma.user.findUnique({ where: { email: 'qs.team@bluerhine.com' } });
  const completedProject = await prisma.project.upsert({
    where: { projectNo: 'BRI-QS-COMPLETED-E2E' },
    update: {
      name: 'QS Completed Verification Project',
      category: 'Project',
      status: 'ACTIVE',
      salesPerson: 'QS Test Data',
    },
    create: {
      projectNo: 'BRI-QS-COMPLETED-E2E',
      name: 'QS Completed Verification Project',
      category: 'Project',
      status: 'ACTIVE',
      salesPerson: 'QS Test Data',
    },
  });
  const completedTask = await prisma.task.upsert({
    where: { taskNo: 'TSK-QS-COMPLETED-E2E' },
    update: {
      projectId: completedProject.id,
      title: 'Completed QS Sign Family Verification',
      designType: 'Project',
      status: 'DESIGN_COMPLETED',
      priority: 'Low',
    },
    create: {
      taskNo: 'TSK-QS-COMPLETED-E2E',
      projectId: completedProject.id,
      title: 'Completed QS Sign Family Verification',
      designType: 'Project',
      status: 'DESIGN_COMPLETED',
      priority: 'Low',
    },
  });
  await prisma.projectSignRow.deleteMany({ where: { taskId: completedTask.id } });
  await prisma.projectSignRow.create({
    data: {
      taskId: completedTask.id,
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

