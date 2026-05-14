import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateChatterPostDto {
  @IsOptional()
  @IsUUID()
  taskId?: string;

  @IsOptional()
  @IsUUID()
  authorId?: string;

  @IsNotEmpty()
  @IsString()
  title: string;

  @IsNotEmpty()
  @IsString()
  message: string;

  @IsOptional()
  @IsString()
  postType?: string;

  @IsOptional()
  @IsString()
  mentionUserId?: string;

  @IsOptional()
  @IsString()
  priority?: string;

  @IsOptional()
  @IsString()
  visibility?: string;
}
