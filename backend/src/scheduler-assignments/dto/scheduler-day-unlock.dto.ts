import { IsDateString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/** Lock a weekend day for a designer (row in ErpTSSchedulerDayUnlock = skip that day). */
export class CreateSchedulerDayLockDto {
  @IsUUID()
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
  @IsUUID()
  designerId!: string;

  @IsDateString()
  date!: string;
}

/** @deprecated Use CreateSchedulerDayLockDto */
export class CreateSchedulerDayUnlockDto extends CreateSchedulerDayLockDto {}

/** @deprecated Use DeleteSchedulerDayLockDto */
export class DeleteSchedulerDayUnlockDto extends DeleteSchedulerDayLockDto {}
