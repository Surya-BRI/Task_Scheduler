import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewLeaveRequestDto {
  @IsNotEmpty()
  @IsString()
  @IsIn(['APPROVED', 'REJECTED'])
  status!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  remarks?: string;
}
