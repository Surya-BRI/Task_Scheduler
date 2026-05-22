import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, ValidateNested } from 'class-validator';

export class ProjectSignRowDto {
  @IsString() @IsOptional() tNo?: string;
  @IsString() @IsOptional() no?: string;
  @IsString() @IsOptional() signType?: string;
  @IsString() @IsOptional() planCode?: string;
  @IsInt() @IsOptional() estQty?: number;
  @IsInt() @IsOptional() qsQty?: number;
  @IsString() @IsOptional() areaZone?: string;
  @IsString() @IsOptional() levelParcel?: string;
  @IsString() @IsOptional() sequence?: string;
  @IsString() @IsOptional() status?: string;
  @IsString() @IsOptional() comment?: string;
  @IsString() @IsOptional() contRef?: string;
}

export class SaveSignRowsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProjectSignRowDto)
  rows: ProjectSignRowDto[];
}
