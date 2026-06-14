import { IsDateString, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { LEAVE_REASON_OPTIONS } from '../../common/constants/leave-reasons';

export class CreateLeaveRequestDto {
  @IsNotEmpty()
  @IsString()
  userId: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  type: string;

  @IsNotEmpty()
  @IsDateString()
  startDate: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsNotEmpty()
  @IsString()
  @IsIn([...LEAVE_REASON_OPTIONS])
  reasonCategory: string;

  @ValidateIf((o) => o.reasonCategory === 'Other')
  @IsNotEmpty()
  @IsString()
  @MaxLength(4000)
  reasonOther?: string;
}
