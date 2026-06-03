import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class UpdateOvertimeRequestDto {
  @IsOptional()
  @IsString()
  @Matches(UUID_RE, { message: 'designerId must be a UUID string' })
  designerId?: string;

  @IsOptional()
  @IsString()
  @Matches(UUID_RE, { message: 'taskId must be a UUID string' })
  taskId?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be in YYYY-MM-DD format' })
  date?: string;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'startTime must be in HH:mm format' })
  startTime?: string;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'endTime must be in HH:mm format' })
  endTime?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  requestedHours?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  status?: string;
}
