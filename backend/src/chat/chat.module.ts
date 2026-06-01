import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const authMode = (configService.get<string>('auth.mode') ?? 'demo').toLowerCase();
        const secret =
          authMode === 'external'
            ? (configService.get<string>('auth.externalJwtSecret') ?? configService.get<string>('jwt.accessSecret') ?? 'change_me')
            : (configService.get<string>('jwt.accessSecret') ?? 'change_me');
        return {
          secret,
          signOptions: {
            expiresIn: (configService.get<string>('jwt.accessExpiresIn') ?? '1d') as never,
          },
        };
      },
    }),
  ],
  controllers: [ChatController],
  providers: [ChatService, ChatGateway],
  exports: [ChatService, ChatGateway],
})
export class ChatModule {}
