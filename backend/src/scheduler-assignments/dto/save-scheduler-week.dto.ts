import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, Min, ValidateNested } from 'class-validator';

// ERP ErpAuthUsers.userId is a decimal bigint, not a GUID.
const NUMERIC_ID_RE = /^\d+$/;

export class SchedulerAssignmentInputDto {
  @Matches(NUMERIC_ID_RE)
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

  /** Logged-time remainder after partial handoff — non-draggable audit slice. */
  @IsOptional()
  @IsBoolean()
  isLocked?: boolean;
}

export class SchedulerOverflowInputDto {
  @Matches(NUMERIC_ID_RE)
  designerId: string;

  /** Canonical (parent) task id — the same id used across all of this task's split parts. */
  @IsUUID()
  taskId: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  hours: number;

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

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  resolvedFragmentIds?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  affectedTaskIds?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SchedulerOverflowInputDto)
  overflow?: SchedulerOverflowInputDto[];
}
