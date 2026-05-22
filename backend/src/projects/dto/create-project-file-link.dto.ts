import { IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

export class CreateProjectFileLinkDto {
  @IsString()
  @IsUrl({ require_protocol: true }, { message: 'url must be a valid absolute URL' })
  @MaxLength(1024)
  url: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  fileName: string;
}
