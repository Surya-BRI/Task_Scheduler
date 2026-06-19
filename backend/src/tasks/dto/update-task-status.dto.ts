import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateTaskStatusDto {
  @IsString()
  @IsIn([
    // Legacy statuses (existing tasks)
    'PENDING', 'WIP', 'COMPLETED', 'REVISION', 'APPROVED', 'ON_HOLD',
    // New design lifecycle statuses
    'DESIGN_NEW', 'DESIGN_PLANNED', 'IN_PROGRESS', 'DESIGN_COMPLETED',
    'HOD_REVIEW', 'SALES_REVIEW', 'REWORK', 'CLIENT_ACCEPTED', 'CLIENT_REJECTED',
  ])
  status: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reworkNote?: string;

  // Reference file pre-uploaded via POST /tasks/upload-file
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reworkAttachmentUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reworkAttachmentName?: string;

  // External reference link
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reworkLinkUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reworkLinkName?: string;
}
