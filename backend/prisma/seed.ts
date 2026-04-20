import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  for (const role of ['HOD', 'DESIGNER']) {
    await prisma.role.upsert({
      where: { name: role },
      update: {},
      create: { name: role },
    });
  }

  const hodRole = await prisma.role.findUnique({ where: { name: 'HOD' } });
  const designerRole = await prisma.role.findUnique({ where: { name: 'DESIGNER' } });

  if (!hodRole || !designerRole) {
    throw new Error('Required roles were not found after seeding roles');
  }

  const hodPasswordHash = await bcrypt.hash('Secret123!', 10);
  const designerPasswordHash = await bcrypt.hash('Secret123!', 10);

  await prisma.user.upsert({
    where: { email: 'hod@company.com' },
    update: {
      fullName: 'HOD User',
      roleId: hodRole.id,
      passwordHash: hodPasswordHash,
    },
    create: {
      email: 'hod@company.com',
      fullName: 'HOD User',
      roleId: hodRole.id,
      passwordHash: hodPasswordHash,
    },
  });

  await prisma.user.upsert({
    where: { email: 'designer@company.com' },
    update: {
      fullName: 'Designer User',
      roleId: designerRole.id,
      passwordHash: designerPasswordHash,
    },
    create: {
      email: 'designer@company.com',
      fullName: 'Designer User',
      roleId: designerRole.id,
      passwordHash: designerPasswordHash,
    },
  });
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
