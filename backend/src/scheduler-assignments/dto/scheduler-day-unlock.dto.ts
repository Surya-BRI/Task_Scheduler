import { IsDateString, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

// ERP ErpAuthUsers.userId is a decimal bigint, not a GUID.
const NUMERIC_ID_RE = /^\d+$/;

/** Lock a weekend day for a designer (row in ErpTSSchedulerDayUnlock = skip that day). */
export class CreateSchedulerDayLockDto {
  @Matches(NUMERIC_ID_RE)
  designerId!: string;

  /** Calendar date YYYY-MM-DD — must be Saturday or Sunday (UTC date). */
  @IsDateString()
  date!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/** Remove a weekend day lock (day becomes open again). */
export class DeleteSchedulerDayLockDto {
  @Matches(NUMERIC_ID_RE)
  designerId!: string;

  @IsDateString()
  date!: string;
}

/** @deprecated Use CreateSchedulerDayLockDto */
export class CreateSchedulerDayUnlockDto extends CreateSchedulerDayLockDto {}

/** @deprecated Use DeleteSchedulerDayLockDto */
export class DeleteSchedulerDayUnlockDto extends DeleteSchedulerDayLockDto {}
