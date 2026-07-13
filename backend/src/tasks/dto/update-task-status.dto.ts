import { IsArray, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class UpdateTaskStatusDto {
  @IsString()
  @IsIn([
    'DESIGN_NEW', 'DESIGN_PLANNED', 'IN_PROGRESS', 'DESIGN_COMPLETED',
    'HOD_REVIEW', 'SALES_REVIEW', 'REWORK', 'CLIENT_ACCEPTED', 'CLIENT_REJECTED',
    'ON_HOLD',
  ])
  status: string;

  /**
   * Scheduler-consolidation guard (ON_HOLD only): the caller's known-live SchedulerAssignment
   * row ids for this task at the time it decided to fold all parts into one whole-task status
   * change. If the server finds any OTHER live row for this task not in this list, the status
   * change is rejected instead of silently deleting a sibling the caller didn't know about.
   * Omit entirely to skip this check (existing non-scheduler callers are unaffected).
   */
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  expectedAssignmentIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reworkNote?: string;

  // Reference file pre-uploaded via POST /tasks/upload-file
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reworkAttachmentUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reworkAttachmentName?: string;

  // External reference link
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reworkLinkUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reworkLinkName?: string;
}
