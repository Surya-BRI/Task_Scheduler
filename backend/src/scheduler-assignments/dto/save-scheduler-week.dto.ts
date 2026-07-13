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

  /** Logged-time remainder after partial handoff — non-draggable audit slice. */
  @IsOptional()
  @IsBoolean()
  isLocked?: boolean;
}

/**
 * Hours that didn't fit anywhere in the week being saved — e.g. a task dropped on a designer's
 * Friday whose remaining capacity is less than the task's hours. The server finds the next
 * available working day (skipping weekends/holidays/full-day leave, possibly in a later week)
 * and creates the SchedulerAssignment row(s) itself, atomically with the rest of this save —
 * no client-side carry-forward, no dependency on the destination week ever being loaded.
 */
export class SchedulerOverflowInputDto {
  @IsUUID()
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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SchedulerOverflowInputDto)
  overflow?: SchedulerOverflowInputDto[];
}
