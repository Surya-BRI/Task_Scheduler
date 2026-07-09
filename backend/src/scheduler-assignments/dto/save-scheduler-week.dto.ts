import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, Min, ValidateNested } from 'class-validator';

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

  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;
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

  // Fragment rows (see SchedulerTaskFragment) that this save resolves — either the
  // fragment was dragged back onto the grid (now present in `assignments`) or its
  // hours were otherwise reconciled client-side. Deleted server-side in the same
  // transaction so no stale sidebar card lingers.
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  resolvedFragmentIds?: string[];

  /**
   * When set, only rows for these task ids in this week are replaced — other assignments
   * are left untouched so concurrent editors working on different tasks can merge saves.
   */
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  affectedTaskIds?: string[];
}
