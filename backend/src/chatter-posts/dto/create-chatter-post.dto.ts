import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateChatterPostDto {
  @IsOptional()
  @IsUUID()
  taskId?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsNotEmpty()
  @IsString()
  message: string;

  @IsOptional()
  @IsString()
  postType?: string;

  @IsOptional()
  @IsUUID()
  mentionUserId?: string;

  @IsOptional()
  @IsString()
  priority?: string;

  @IsOptional()
  @IsString()
  visibility?: string;
}
