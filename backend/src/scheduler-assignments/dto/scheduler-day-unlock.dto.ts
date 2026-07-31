import { IsDateString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateSchedulerDayUnlockDto {
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

export class DeleteSchedulerDayUnlockDto {
  @IsUUID()
  designerId!: string;

  @IsDateString()
  date!: string;
}
