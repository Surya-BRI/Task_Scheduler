import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DeadlineAlertsService } from './deadline-alerts.service';

@Module({
  imports: [PrismaModule, NotificationsModule],
  providers: [DeadlineAlertsService],
})
export class DeadlineAlertsModule {}
