import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  fullName?: string;

  @IsString()
  @IsOptional()
  role?: string;

  @IsString()
  @IsOptional()
  departmentId?: string;

  @IsString()
  @MinLength(6)
  @IsOptional()
  password?: string;
}
