import { IsIn } from 'class-validator';

export class UpdateOvertimeSchedulerActionDto {
  @IsIn(['ON_HOLD', 'UNASSIGN'])
  action: 'ON_HOLD' | 'UNASSIGN';
}
