import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateTaskDto {
  @IsString()
  @MinLength(2)
  title: string;

  @IsString()
  @IsOptional()
  opNo?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsUUID()
  projectId: string;

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
