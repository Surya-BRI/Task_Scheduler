import { Matches } from 'class-validator';

// ERP ErpAuthUsers.userId is a decimal bigint, not a GUID.
export class AssignTaskDto {
  @Matches(/^\d+$/)
  assigneeId!: string;
}
