import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewOvertimeRequestDto {
  @IsNotEmpty()
  @IsString()
  status!: 'APPROVED_BY_MANAGER' | 'REJECTED_BY_MANAGER' | 'APPROVED' | 'REJECTED_BY_HR';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comments?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  approvedHours?: string;
}
