import { IsInt, IsOptional, IsString, IsUrl, Min, ValidateIf } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class SubmitWorkDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  durationSeconds: number;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_, value) => value != null && String(value).trim() !== '')
  @IsUrl(
    { protocols: ['https'], require_protocol: true },
    { message: 'submissionLink must be a valid https:// URL' },
  )
  @IsString()
  submissionLink?: string;

  @IsOptional()
  @IsString()
  pauseLog?: string; // JSON string: [{reason: string, durationSeconds: number}]
}
