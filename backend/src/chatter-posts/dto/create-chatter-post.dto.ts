import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, IsUUID, ValidateIf } from 'class-validator';

function emptyToUndefined(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string' && !value.trim()) return undefined;
  return value;
}

export class CreateChatterPostDto {
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @ValidateIf((_, v) => v !== undefined)
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
  @Transform(({ value }) => emptyToUndefined(value))
  @ValidateIf((_, v) => v !== undefined)
  @IsUUID()
  mentionUserId?: string;

  @IsOptional()
  @IsString()
  priority?: string;

  @IsOptional()
  @IsString()
  visibility?: string;

  /** JSON array of { url, displayName?, platform? } for external link attachments */
  @IsOptional()
  @IsString()
  linkAttachmentsJson?: string;
}
