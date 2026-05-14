import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CreateOvertimeRequestDto } from './dto/create-overtime-request.dto';
import { UpdateOvertimeRequestDto } from './dto/update-overtime-request.dto';
import { OvertimeRequestsService } from './overtime-requests.service';
import { isUuidString } from '../regularization-requests/sql-uuid.util';

@Controller('overtime-requests')
export class OvertimeRequestsController {
  constructor(private readonly overtimeRequestsService: OvertimeRequestsService) {}

  @Get()
  findByDesigner(@Query('designerId') designerIdParam?: string) {
    const designerId = (designerIdParam ?? '').trim();
    if (!designerId) return [];
    if (!isUuidString(designerId)) {
      throw new BadRequestException(
        'Query designerId must be a UUID (SQL uniqueidentifier), matching ErpTSOvertimeRequest.designerId.',
      );
    }
    return this.overtimeRequestsService.findByDesigner(designerId);
  }

  @Post()
  create(@Body() dto: CreateOvertimeRequestDto) {
    return this.overtimeRequestsService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateOvertimeRequestDto) {
    return this.overtimeRequestsService.update(id, dto);
  }
}
