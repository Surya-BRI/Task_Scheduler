import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CreateRegularizationRequestDto } from './dto/create-regularization-request.dto';
import { UpdateRegularizationStatusDto } from './dto/update-regularization-status.dto';
import { RegularizationRequestsService } from './regularization-requests.service';
import { isUuidString } from './sql-uuid.util';

@Controller('regularization-requests')
export class RegularizationRequestsController {
  constructor(private readonly regularizationRequestsService: RegularizationRequestsService) {}

  @Get()
  findByDesigner(@Query('designerId') designerIdParam?: string) {
    const designerId = (designerIdParam ?? '').trim();
    if (!designerId) {
      return [];
    }
    if (!isUuidString(designerId)) {
      throw new BadRequestException(
        'Query designerId must be a UUID (SQL uniqueidentifier), e.g. the designer’s ErpTSRegularizationRequest.designerId value.',
      );
    }
    return this.regularizationRequestsService.findByDesigner(designerId);
  }

  @Post()
  create(@Body() dto: CreateRegularizationRequestDto) {
    return this.regularizationRequestsService.create(dto);
  }

  @Patch(':id')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateRegularizationStatusDto) {
    return this.regularizationRequestsService.updateStatus(id, dto);
  }
}
