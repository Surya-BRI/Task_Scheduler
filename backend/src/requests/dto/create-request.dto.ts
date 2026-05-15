import { IsNotEmpty, IsOptional, IsString, IsDateString } from 'class-validator';

export class CreateLeaveRequestDto {
  @IsNotEmpty()
  @IsString()
  userId: string; // The user the request is for (designerId in frontend)

  @IsNotEmpty()
  @IsString()
  type: string; // "Leave", "Half Day", "Regularization"

  @IsNotEmpty()
  @IsDateString()
  startDate: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
