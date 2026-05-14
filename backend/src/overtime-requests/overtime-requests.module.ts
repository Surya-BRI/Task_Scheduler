import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OvertimeRequestsController } from './overtime-requests.controller';
import { OvertimeRequestsService } from './overtime-requests.service';

@Module({
  imports: [PrismaModule],
  controllers: [OvertimeRequestsController],
  providers: [OvertimeRequestsService],
})
export class OvertimeRequestsModule {}
