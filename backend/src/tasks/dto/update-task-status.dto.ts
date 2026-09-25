import { IsArray, IsIn, IsOptional, IsString, IsUrl, IsUUID, MaxLength, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateTaskStatusDto {
  @IsString()
  @IsIn([
    'DESIGN_NEW', 'DESIGN_PLANNED', 'IN_PROGRESS', 'DESIGN_COMPLETED',
    'HOD_REVIEW', 'SALES_REVIEW', 'REWORK', 'CLIENT_ACCEPTED', 'CLIENT_REJECTED',
    'ON_HOLD',
  ])
  status: string;

  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  expectedAssignmentIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reworkNote?: string;

  // Reference file pre-uploaded via POST /tasks/upload-file
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reworkAttachmentUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reworkAttachmentName?: string;

  // External reference link — https only when provided
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_, value) => value != null && String(value).trim() !== '')
  @IsUrl(
    { protocols: ['https'], require_protocol: true },
    { message: 'reworkLinkUrl must be a valid https:// URL' },
  )
  @IsString()
  @MaxLength(2000)
  reworkLinkUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reworkLinkName?: string;
}
