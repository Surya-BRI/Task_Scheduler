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

  const demoAccounts = [
    { fullName: 'Sarah Mitchell', email: 'sarah.mitchell@bluerhine.com', password: 'hod123', role: hodRole },
    { fullName: 'Alex Johnson', email: 'alex.johnson@bluerhine.com', password: 'alex123', role: designerRole },
    { fullName: 'Alexander Allen', email: 'alexander.allen@bluerhine.com', password: 'alex123', role: designerRole },
    { fullName: 'Benjamin Harris', email: 'benjamin.harris@bluerhine.com', password: 'ben123', role: designerRole },
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

