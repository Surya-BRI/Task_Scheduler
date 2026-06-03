import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';

export class CreateChatterCommentDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(8000)
  message!: string;

  @IsOptional()
  @IsUUID()
  @ValidateIf((_, v) => v !== undefined && v !== null && String(v).trim() !== '')
  mentionUserId?: string;
}
