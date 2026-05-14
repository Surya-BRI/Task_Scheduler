import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class CreateOvertimeRequestDto {
  @IsString()
  @Matches(UUID_RE, { message: 'designerId must be a UUID string' })
  designerId!: string;

  @IsString()
  @Matches(UUID_RE, { message: 'taskId must be a UUID string' })
  taskId!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  estimatedRemaining!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  requestedHours!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  status?: string;
}
