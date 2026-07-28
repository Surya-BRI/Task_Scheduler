import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class CreateReallocationRequestDto {
  @IsString()
  @Matches(UUID_RE, { message: 'taskId must be a UUID string' })
  taskId!: string;

  @IsString()
  @Matches(UUID_RE, { message: 'suggestedDesignerId must be a UUID string' })
  suggestedDesignerId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  reason!: string;
}

export class ReviewReallocationRequestDto {
  @IsIn(['Approved', 'Rejected'])
  status!: 'Approved' | 'Rejected';

  @ValidateIf((o) => o.status === 'Approved')
  @IsOptional()
  @IsString()
  @Matches(UUID_RE, { message: 'targetDesignerId must be a UUID string' })
  targetDesignerId?: string;

  @ValidateIf((o) => o.status === 'Rejected')
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  remarks?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comments?: string;
}
