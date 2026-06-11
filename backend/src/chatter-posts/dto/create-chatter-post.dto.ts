import { Transform } from 'class-transformer';
import { IsArray, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';

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
  @Transform(({ value }) => emptyToUndefined(value))
  @ValidateIf((_, v) => v !== undefined)
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(5000)
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
  @Transform(({ value }) => {
    if (value == null || value === '') return undefined;
    if (Array.isArray(value)) return value.filter((v) => typeof v === 'string' && v.trim());
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return undefined;
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.filter((v) => typeof v === 'string' && v.trim());
      } catch {
        return trimmed.split(',').map((s) => s.trim()).filter(Boolean);
      }
    }
    return undefined;
  })
  @IsArray()
  @IsUUID('4', { each: true })
  mentionUserIds?: string[];

  @IsOptional()
  @Transform(({ value }) => {
    const v = emptyToUndefined(value);
    if (typeof v !== 'string') return v;
    const normalized = v.trim();
    if (!normalized) return undefined;
    const lower = normalized.toLowerCase();
    if (lower === 'high') return 'High';
    if (lower === 'medium') return 'Medium';
    if (lower === 'low') return 'Low';
    return normalized;
  })
  @IsIn(['High', 'Medium', 'Low'])
  priority?: string;

  @IsOptional()
  @IsString()
  visibility?: string;

  /** JSON array of { url, displayName?, platform? } for external link attachments */
  @IsOptional()
  @IsString()
  linkAttachmentsJson?: string;
}
