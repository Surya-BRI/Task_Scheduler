import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class SubmitWorkDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  durationSeconds: number;

  @IsOptional()
  @IsString()
  submissionLink?: string;

  @IsOptional()
  @IsString()
  pauseLog?: string; // JSON string: [{reason: string, durationSeconds: number}]
}
