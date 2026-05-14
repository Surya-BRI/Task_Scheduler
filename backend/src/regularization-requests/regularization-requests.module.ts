import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RegularizationRequestsController } from './regularization-requests.controller';
import { RegularizationRequestsService } from './regularization-requests.service';

@Module({
  imports: [PrismaModule],
  controllers: [RegularizationRequestsController],
  providers: [RegularizationRequestsService],
})
export class RegularizationRequestsModule {}
