import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateOvertimeRequestDto {
  @IsIn(['Approved', 'Rejected', 'Pending'])
  status!: 'Approved' | 'Rejected' | 'Pending';

  @IsOptional()
  @IsString()
  @MaxLength(80)
  approvedHours?: string;
}
