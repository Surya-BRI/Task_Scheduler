import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class TaskAttachmentInputDto {
  @IsString()
  @MinLength(1)
  fileKey: string;

  @IsString()
  @MinLength(1)
  fileName: string;

  @IsString()
  @IsOptional()
  mimeType?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  size?: number;
}

class ExtendedTaskCoreDto {
  @IsString()
  @MinLength(2)
  title: string;

  @IsString()
  @IsOptional()
  opNo?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsUUID()
  @IsOptional()
  projectId?: string;

  @IsString()
  @IsOptional()
  projectNo?: string;

  @IsString()
  @MinLength(2)
  projectName: string;

  @IsString()
  @IsOptional()
  businessUnit?: string;

  @IsString()
  @IsOptional()
  sourceRecordId?: string;

  @IsString()
  @IsOptional()
  assigneeId?: string;

  @IsString()
  @IsIn(['High', 'Medium', 'Low'])
  @IsOptional()
  priority?: string;

  @IsDateString()
  @IsOptional()
  dueDate?: string;
}

export class RetailDetailInputDto {
  @IsString()
  @IsOptional()
  providedFile?: string;

  @IsString()
  @IsOptional()
  fileKey?: string;

  @IsString()
  @IsOptional()
  fileUrl?: string;

  @IsString()
  @IsOptional()
  hodName?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  designTypes?: string[];

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  hoursRequired?: number;

  @IsString()
  @IsOptional()
  comment?: string;

  @IsString()
  @IsOptional()
  signFamily?: string;

  @IsString()
  @IsOptional()
  signType?: string;

  @IsString()
  @IsOptional()
  planCode?: string;

  @IsString()
  @IsOptional()
  contractRef?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  quantity?: number;

  @IsDateString()
  @IsOptional()
  deadline?: string;

  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => TaskAttachmentInputDto)
  @IsOptional()
  attachments?: TaskAttachmentInputDto[];
}

export class ProjectDetailInputDto {
  @IsString()
  @IsOptional()
  signType?: string;

  @IsString()
  @IsOptional()
  planCode?: string;

  @IsString()
  @IsOptional()
  area?: string;

  @IsString()
  @IsOptional()
  level?: string;

  @IsBoolean()
  @IsOptional()
  artwork?: boolean;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  artworkHours?: number;

  @IsBoolean()
  @IsOptional()
  technical?: boolean;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  technicalHours?: number;

  @IsBoolean()
  @IsOptional()
  location?: boolean;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  locationHours?: number;

  @IsBoolean()
  @IsOptional()
  asBuilt?: boolean;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  asBuiltHours?: number;

  @IsBoolean()
  @IsOptional()
  bim?: boolean;

  @IsDateString()
  @IsOptional()
  deadline?: string;

  @IsString()
  @IsOptional()
  comment?: string;

  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => TaskAttachmentInputDto)
  @IsOptional()
  attachments?: TaskAttachmentInputDto[];
}

export class CreateExtendedTaskDto {
  @ValidateNested()
  @Type(() => ExtendedTaskCoreDto)
  task: ExtendedTaskCoreDto;

  @IsString()
  @IsIn(['Retail', 'Project'])
  designType: 'Retail' | 'Project';

  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => RetailDetailInputDto)
  @IsOptional()
  retailDetails?: RetailDetailInputDto[];

  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => ProjectDetailInputDto)
  @IsOptional()
  projectDetails?: ProjectDetailInputDto[];
}
