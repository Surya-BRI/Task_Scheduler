/**
 * Deletes all tasks whose status is a legacy value (PENDING, WIP, REVISION, COMPLETED, APPROVED).
 * Nulls out NoAction foreign keys first, then deletes tasks (cascades handle the rest).
 *
 * Run: npx ts-node -r tsconfig-paths/register prisma/scripts/clear-legacy-tasks.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const LEGACY_STATUSES = ['PENDING', 'WIP', 'REVISION', 'COMPLETED', 'APPROVED'];

async function main() {
  const legacyTasks = await prisma.task.findMany({
    where: { status: { in: LEGACY_STATUSES as any } },
    select: { id: true, status: true, taskNo: true },
  });

  if (legacyTasks.length === 0) {
    console.log('No legacy-status tasks found. Nothing to delete.');
    return;
  }

  console.log(`Found ${legacyTasks.length} legacy tasks to delete:`);
  const statusCounts: Record<string, number> = {};
  for (const t of legacyTasks) {
    statusCounts[t.status ?? 'null'] = (statusCounts[t.status ?? 'null'] ?? 0) + 1;
  }
  console.table(statusCounts);

  const ids = legacyTasks.map((t) => t.id);

  console.log('\nNulling out NoAction FK references...');
  await prisma.$transaction(async (tx) => {
    // Null out NoAction references before deleting tasks
    await tx.chatterPost.updateMany({
      where: { taskId: { in: ids } },
      data: { taskId: null },
    });

    await tx.activityLog.updateMany({
      where: { taskId: { in: ids } },
      data: { taskId: null },
    });

    await tx.schedulerAssignment.updateMany({
      where: { taskId: { in: ids } },
      data: { taskId: null },
    });

    await tx.regularizationRequest.updateMany({
      where: { taskId: { in: ids } },
      data: { taskId: null },
    });

    await tx.overtimeRequest.updateMany({
      where: { taskId: { in: ids } },
      data: { taskId: null },
    });

    // Delete tasks — cascades handle RetailTaskDetail, ProjectTaskDetail,
    // ProjectSignRow, TaskWorkSession and all their attachments/files.
    const deleted = await tx.task.deleteMany({
      where: { id: { in: ids } },
    });

    console.log(`Deleted ${deleted.count} tasks and all cascaded records.`);
  });

  console.log('\nDone. Legacy tasks cleared.');
}

main()
  .catch((err) => {
    console.error('Error during cleanup:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
