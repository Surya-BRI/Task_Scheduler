import { IsDateString, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateTaskDto {
  @IsString()
  @MinLength(2)
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsIn(['High', 'Medium', 'Low'])
  @IsOptional()
  priority?: string;

  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @IsString() @IsOptional() technicalHead?: string;
  @IsString() @IsOptional() teamLead?: string;
  @IsString() @IsOptional() subTeamLead?: string;
  @IsString() @IsOptional() designers?: string;
}
