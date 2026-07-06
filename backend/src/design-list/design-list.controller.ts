import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { DesignListService } from './design-list.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('design-list')
@UseGuards(JwtAuthGuard)
export class DesignListController {
  constructor(private readonly designListService: DesignListService) {}

  @Get()
  findAll(
    @Query('page') pageParam?: string,
    @Query('limit') limitParam?: string,
    @Query('q') q?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('salesPerson') salesPerson?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const hasPagination = pageParam != null || limitParam != null;
    const hasFilters = [q, type, status, salesPerson, startDate, endDate].some(
      (value) => (value ?? '').trim().length > 0,
    );

    if (!hasPagination && !hasFilters) {
      return this.designListService.findAll();
    }

    const page = Math.max(1, Number.parseInt(pageParam ?? '1', 10) || 1);
    const limit = Math.min(200, Math.max(1, Number.parseInt(limitParam ?? '100', 10) || 100));

    return this.designListService.findDesignListPage(page, limit, {
      q: q ?? '',
      type: type ?? '',
      status: status ?? '',
      salesPerson: salesPerson ?? '',
      startDate: startDate ?? '',
      endDate: endDate ?? '',
    });
  }

  @Get('project-sign-types')
  findProjectSignTypes(@Query('salesForceCode') salesForceCode?: string) {
    if (!salesForceCode?.trim()) return [];
    return this.designListService.findProjectSignTypes(salesForceCode.trim());
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
