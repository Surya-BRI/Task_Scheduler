import { IsDateString, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @IsOptional()
  projectNo?: string;

  @IsString()
  @IsIn(['Retail', 'Project'])
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  businessUnit?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsIn(['ACTIVE', 'COMPLETED', 'ON_HOLD'])
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  salesPerson?: string;
}
