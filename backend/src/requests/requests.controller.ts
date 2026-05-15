import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { RequestsService } from './requests.service';
import { CreateLeaveRequestDto } from './dto/create-request.dto';
import { UpdateRequestStatusDto } from './dto/update-request-status.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('requests')
export class RequestsController {
  constructor(private readonly requestsService: RequestsService) {}

  @Get()
  findAll(@Query('designerId') designerId?: string) {
    return this.requestsService.findAll(designerId);
  }

  @Post()
  create(@Body() createDto: CreateLeaveRequestDto) {
    return this.requestsService.create(createDto);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() updateDto: UpdateRequestStatusDto) {
    return this.requestsService.updateStatus(id, updateDto);
  }
}
