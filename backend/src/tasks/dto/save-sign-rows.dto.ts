import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';

export class ProjectSignRowDto {
  @IsUUID() @IsOptional() id?: string;
  @IsString() @IsNotEmpty() tNo: string;
  @IsString() @IsNotEmpty() no: string;
  @IsString() @IsNotEmpty() signType: string;
  @IsString() @IsNotEmpty() planCode: string;
  @IsInt() estQty: number;
  @IsInt() qsQty: number;
  @IsString() @IsNotEmpty() areaZone: string;
  @IsString() @IsNotEmpty() levelParcel: string;
  @IsString() @IsNotEmpty() sequence: string;
  @IsString() @IsNotEmpty() status: string;
  @IsString() @IsOptional() comment?: string;
  @IsString() @IsNotEmpty() contRef: string;
}

export class SaveSignRowsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProjectSignRowDto)
  rows: ProjectSignRowDto[];
}
