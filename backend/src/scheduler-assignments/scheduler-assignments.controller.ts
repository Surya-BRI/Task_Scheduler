import { Controller, Get, Query } from '@nestjs/common';
import { SchedulerAssignmentsService } from './scheduler-assignments.service';

@Controller('scheduler-assignments')
export class SchedulerAssignmentsController {
  constructor(private readonly schedulerAssignmentsService: SchedulerAssignmentsService) {}

  @Get()
  findForWeek(@Query('weekStart') weekStart?: string) {
    const ws = weekStart?.trim() ?? '';
    if (!ws) {
      return [];
    }
    return this.schedulerAssignmentsService.findForWeekStart(ws);
  }
}
