import { IsIn, IsString } from 'class-validator';

export class UpdateTaskStatusDto {
  @IsString()
  @IsIn([
    // Legacy statuses (existing tasks)
    'PENDING', 'WIP', 'COMPLETED', 'REVISION', 'APPROVED', 'ON_HOLD',
    // New design lifecycle statuses
    'DESIGN_NEW', 'DESIGN_PLANNED', 'IN_PROGRESS', 'DESIGN_COMPLETED',
    'HOD_REVIEW', 'SALES_REVIEW', 'REWORK', 'REVIEW_COMPLETED', 'CLIENT_REJECTED',
  ])
  status: string;
}
