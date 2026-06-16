import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @IsIn(['Retail', 'Project'])
  category?: string;

  @IsOptional()
  @IsString()
  businessUnit?: string;

  @IsOptional()
  @IsString()
  @IsIn(['ACTIVE', 'COMPLETED', 'ON_HOLD'])
  status?: string;

  @IsOptional()
  @IsString()
  salesPerson?: string;

  @IsOptional()
  @IsString()
  technicalHead?: string;

  @IsOptional()
  @IsString()
  teamLead?: string;

  @IsOptional()
  @IsString()
  subTeamLead?: string;
}
