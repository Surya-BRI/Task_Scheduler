import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class UpdateRequestStatusDto {
  @IsNotEmpty()
  @IsString()
  @IsIn(['APPROVED', 'REJECTED', 'PENDING'])
  status: string;
}
