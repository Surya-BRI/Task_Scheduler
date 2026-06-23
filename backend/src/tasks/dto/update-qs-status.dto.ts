import { IsIn, IsOptional, IsString } from 'class-validator';

export const QS_STATUS_VALUES = ['Pending', 'In Progress', 'Completed'] as const;
export type QsStatusValue = (typeof QS_STATUS_VALUES)[number];

export class UpdateQsStatusDto {
  @IsIn(QS_STATUS_VALUES)
  status: QsStatusValue;

  @IsString()
  @IsOptional()
  note?: string;
}
