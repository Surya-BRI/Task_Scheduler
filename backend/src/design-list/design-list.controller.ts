import { Controller, Get } from '@nestjs/common';
import { DesignListService } from './design-list.service';

@Controller('design-list')
export class DesignListController {
  constructor(private readonly designListService: DesignListService) {}

  @Get()
  findAll() {
    return this.designListService.findAll();
  }
}

