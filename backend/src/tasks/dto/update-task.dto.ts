import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

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

  /** Estimated hours entered at creation. Only Design HOD may persist this after create. */
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @IsOptional()
  hoursRequired?: number;
}
