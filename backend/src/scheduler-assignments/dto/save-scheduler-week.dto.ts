import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, Min, ValidateNested } from 'class-validator';

export class SchedulerAssignmentInputDto {
  @IsUUID()
  designerId: string;

  @IsUUID()
  taskId: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  dayIndex: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  assignedHours: number;

  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  splitIndex?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  totalParts?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  position?: number;

  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class SaveSchedulerWeekDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  version: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SchedulerAssignmentInputDto)
  assignments: SchedulerAssignmentInputDto[];
}
