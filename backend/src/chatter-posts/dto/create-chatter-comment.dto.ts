import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateChatterCommentDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(8000)
  message!: string;
}
