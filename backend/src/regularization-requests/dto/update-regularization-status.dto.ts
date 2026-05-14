import { IsIn, IsOptional, IsString, Matches } from 'class-validator';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class UpdateRegularizationStatusDto {
  @IsIn(['Approved', 'Rejected', 'Pending'])
  status!: 'Approved' | 'Rejected' | 'Pending';

  @IsOptional()
  @IsString()
  @Matches(UUID_RE, { message: 'approverId must be a UUID string' })
  approverId?: string;
}
