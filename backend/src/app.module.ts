import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { DepartmentsModule } from './departments/departments.module';
import { ProjectsModule } from './projects/projects.module';
import { TasksModule } from './tasks/tasks.module';
import { DesignListModule } from './design-list/design-list.module';
import { RegularizationRequestsModule } from './regularization-requests/regularization-requests.module';
import { OvertimeRequestsModule } from './overtime-requests/overtime-requests.module';
import { SchedulerAssignmentsModule } from './scheduler-assignments/scheduler-assignments.module';
import { ChatterPostsModule } from './chatter-posts/chatter-posts.module';
import configuration from './config/configuration';
import { envValidationSchema } from './config/env.validation';
import { resolveEnvFilePaths } from './config/resolve-env-file';
import { ActivitiesModule } from './activities/activities.module';
import { RequestsModule } from './requests/requests.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ChatModule } from './chat/chat.module';
import { NotificationsModule } from './notifications/notifications.module';
import { DeadlineAlertsModule } from './deadline-alerts/deadline-alerts.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: resolveEnvFilePaths(),
      load: [configuration],
      validationSchema: envValidationSchema,
    }),
    // Only the default throttler is global. Named limits (login, upload, etc.) are
    // applied per-route via @Throttle({ default: ... }) — extra names in forRoot()
    // would otherwise apply to every endpoint and cap the whole API at the lowest limit.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }]),
    ScheduleModule.forRoot(),
    PrismaModule,
    HealthModule,
    AuthModule,
    UsersModule,
    DepartmentsModule,
    ProjectsModule,
    TasksModule,
    DesignListModule,
    RegularizationRequestsModule,
    OvertimeRequestsModule,
    SchedulerAssignmentsModule,
    ChatterPostsModule,
    ActivitiesModule,
    RequestsModule,
    DashboardModule,
    ChatModule,
    NotificationsModule,
    DeadlineAlertsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
