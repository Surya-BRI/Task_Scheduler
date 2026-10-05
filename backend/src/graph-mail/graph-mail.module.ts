import { Module } from '@nestjs/common';
import { GraphMailService } from './graph-mail.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [GraphMailService],
  exports: [GraphMailService],
})
export class GraphMailModule {}
