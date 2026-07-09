import { IsDateString, IsInt, IsOptional, IsString, Min, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';

export class SaveTimerStateDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  accumulatedSeconds: number;

  @IsOptional()
  @IsString()
  pauseLog?: string; // JSON: [{reason: string, durationSeconds: number}]

  /** ISO timestamp when the current run began; null clears an in-progress run. */
  @IsOptional()
  @ValidateIf((_, value) => value != null)
  @IsDateString()
  runStartedAt?: string | null;
}
