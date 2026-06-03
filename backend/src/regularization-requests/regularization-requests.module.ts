import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ActivitiesModule } from '../activities/activities.module';
import { RegularizationRequestsController } from './regularization-requests.controller';
import { RegularizationRequestsService } from './regularization-requests.service';

@Module({
  imports: [PrismaModule, ActivitiesModule],
  controllers: [RegularizationRequestsController],
  providers: [RegularizationRequestsService],
  exports: [RegularizationRequestsService],
})
export class RegularizationRequestsModule {}
