import { Transform } from 'class-transformer';
import { IsArray, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';

function emptyToUndefined(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string' && !value.trim()) return undefined;
  return value;
}

export class CreateChatterCommentDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(8000)
  message!: string;

  @IsOptional()
  @IsUUID()
  @ValidateIf((_, v) => v !== undefined && v !== null && String(v).trim() !== '')
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
}
