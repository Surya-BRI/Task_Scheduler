import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class SaveTimerStateDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  accumulatedSeconds: number;

  @IsOptional()
  @IsString()
  pauseLog?: string; // JSON: [{reason: string, durationSeconds: number}]
}
