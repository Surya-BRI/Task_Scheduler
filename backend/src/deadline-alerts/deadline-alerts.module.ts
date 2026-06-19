import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ActivitiesModule } from '../activities/activities.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { DeadlineAlertsService } from './deadline-alerts.service';

@Module({
  imports: [PrismaModule, NotificationsModule, ActivitiesModule, DashboardModule],
  providers: [DeadlineAlertsService],
})
export class DeadlineAlertsModule {}
