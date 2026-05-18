import { IsIn, IsString } from 'class-validator';

export class UpdateTaskStatusDto {
  @IsString()
  @IsIn(['PENDING', 'WIP', 'COMPLETED', 'REVISION', 'APPROVED'])
  status: string;
}
