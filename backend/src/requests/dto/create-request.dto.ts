import { IsDateString, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateLeaveRequestDto {
  @IsNotEmpty()
  @IsString()
  userId: string; // The user the request is for (designerId in frontend)

  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  type: string; // "Leave", "Half Day", etc.

  @IsNotEmpty()
  @IsDateString()
  startDate: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(4000)
  reason: string;
}
