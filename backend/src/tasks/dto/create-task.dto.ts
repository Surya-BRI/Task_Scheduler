import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';

export class CreateTaskDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  revisionCode?: string;

  @IsString()
  @IsOptional()
  designType?: string;

  @IsString()
  @IsOptional()
  opNo?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  projectNo?: string;

  @IsString()
  @IsOptional()
  assigneeId?: string;

  @IsString()
  @IsIn(['High', 'Medium', 'Low'])
  @IsOptional()
  priority?: string;

  @IsDateString()
  @IsOptional()
  dueDate?: string;
}
