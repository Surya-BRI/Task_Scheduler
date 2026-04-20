import { IsDateString, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateTaskDto {
  @IsString()
  @MinLength(2)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsUUID()
  projectId!: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
