import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

async function main() {
  const authorId = '94ba8e71-80ef-4bb8-8373-2a526c8aa987';
  try {
    const post = await prisma.chatterPost.create({
      data: { title: 'link test', message: 'm', authorId },
    });
    console.log('post ok', post.id);
    try {
      const link = await prisma.linkAttachment.create({
        data: {
          id: randomUUID(),
          url: 'https://example.com',
          displayName: 'Ex',
          chatterPostId: post.id,
        },
      });
      console.log('link ok', link.id);
    } catch (linkErr) {
      console.error('link ERR', linkErr);
    }
    await prisma.chatterPost.delete({ where: { id: post.id } });
  } catch (e) {
    console.error('post ERR', e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
