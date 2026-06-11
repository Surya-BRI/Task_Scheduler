import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateChatterPostDto {
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  message?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;
}

export class UpdateChatterCommentDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(8000)
  message: string;
}
