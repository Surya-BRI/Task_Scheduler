import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class CreateRegularizationRequestDto {
  @IsString()
  @Matches(UUID_RE, { message: 'designerId must be a UUID string' })
  designerId!: string;

  @IsOptional()
  @IsIn(['task', 'non-task'])
  regularizationType?: 'task' | 'non-task';

  @ValidateIf((o) => (o.regularizationType ?? 'task') === 'task')
  @IsString()
  @Matches(UUID_RE, { message: 'taskId must be a UUID string' })
  taskId?: string;

  @ValidateIf((o) => o.regularizationType === 'non-task')
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  projectId?: string;

  @ValidateIf((o) => o.regularizationType === 'non-task')
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  workDetails?: string;

  /** YYYY-MM-DD */
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  duration!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  status?: string;
}
