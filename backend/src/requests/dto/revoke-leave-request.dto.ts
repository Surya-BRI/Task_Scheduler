import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RevokeLeaveRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  reason!: string;
}
