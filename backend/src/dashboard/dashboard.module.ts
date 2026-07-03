import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { DashboardGateway } from './dashboard.gateway';
import { DashboardRealtimeService } from './dashboard-realtime.service';
import { PrismaModule } from '../prisma/prisma.module';
import { resolveJwtSecret } from '../common/utils/resolve-jwt-secret.util';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: resolveJwtSecret(configService),
        signOptions: {
          expiresIn: (configService.get<string>('jwt.accessExpiresIn') ?? '1d') as never,
        },
      }),
    }),
  ],
  controllers: [DashboardController],
  providers: [DashboardService, DashboardGateway, DashboardRealtimeService],
  exports: [DashboardService, DashboardRealtimeService],
})
export class DashboardModule {}
