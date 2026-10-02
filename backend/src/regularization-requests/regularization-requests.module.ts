import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ActivitiesModule } from '../activities/activities.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { RegularizationRequestsController } from './regularization-requests.controller';
import { RegularizationRequestsService } from './regularization-requests.service';
import { GraphMailModule } from '../graph-mail/graph-mail.module';

@Module({
  imports: [PrismaModule, ActivitiesModule, DashboardModule, GraphMailModule],
  controllers: [RegularizationRequestsController],
  providers: [RegularizationRequestsService],
  exports: [RegularizationRequestsService],
})
export class RegularizationRequestsModule {}
