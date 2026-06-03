import { IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

export class ReviewRegularizationRequestDto {
  @IsIn(['Approved', 'Rejected'])
  status!: 'Approved' | 'Rejected';

  @ValidateIf((o) => o.status === 'Rejected')
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  comments?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  remarks?: string;
}
