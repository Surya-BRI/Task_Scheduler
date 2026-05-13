import { Controller, Get, Query } from '@nestjs/common';
import { DesignListService } from './design-list.service';

@Controller('design-list')
export class DesignListController {
  constructor(private readonly designListService: DesignListService) {}

  @Get()
  findAll() {
    return this.designListService.findAll();
  }

  @Get('projects-list')
  findProjectsList(
    @Query('page') pageParam?: string,
    @Query('limit') limitParam?: string,
    @Query('q') q?: string,
  ) {
    const page = Math.max(1, Number.parseInt(pageParam ?? '1', 10) || 1);
    const limit = Math.min(200, Math.max(1, Number.parseInt(limitParam ?? '100', 10) || 100));
    return this.designListService.findProjectsListPage(page, limit, q ?? '');
  }
}
