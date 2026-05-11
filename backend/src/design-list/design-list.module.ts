import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DesignListController } from './design-list.controller';
import { DesignListService } from './design-list.service';

@Module({
  imports: [PrismaModule],
  controllers: [DesignListController],
  providers: [DesignListService],
})
export class DesignListModule {}

