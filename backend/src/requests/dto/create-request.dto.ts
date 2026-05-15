import { IsNotEmpty, IsOptional, IsString, IsDateString, IsUUID } from 'class-validator';

export class CreateLeaveRequestDto {
  @IsNotEmpty()
  @IsUUID()
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
