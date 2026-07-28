import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/** Max length for QS sign-row comments (brief remarks). */
export const SIGN_ROW_COMMENT_MAX_LENGTH = 250;

export class ProjectSignRowDto {
  @IsUUID() @IsOptional() id?: string;
  @IsString() @IsNotEmpty() tNo!: string;
  @IsString() @IsNotEmpty() no!: string;
  @IsString() @IsNotEmpty() signType!: string;
  @IsString() @IsNotEmpty() planCode!: string;
  @IsInt() estQty!: number;
  @IsInt() qsQty!: number;
  @IsString() @IsNotEmpty() areaZone!: string;
  @IsString() @IsNotEmpty() levelParcel!: string;
  @IsString() @IsNotEmpty() sequence!: string;
  @IsString() @IsNotEmpty() status!: string;
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsOptional()
  @MaxLength(SIGN_ROW_COMMENT_MAX_LENGTH, {
    message: `comment must be at most ${SIGN_ROW_COMMENT_MAX_LENGTH} characters`,
  })
  comment?: string;
  @IsString() @IsNotEmpty() contRef!: string;
  @IsString() @IsOptional() signFamily?: string;
}

export class SaveSignRowsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProjectSignRowDto)
  rows!: ProjectSignRowDto[];
}
