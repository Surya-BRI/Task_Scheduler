import { IsIn } from 'class-validator';

export class DetachAssignmentPartDto {
  @IsIn(['UNASSIGNED', 'ON_HOLD'])
  status: 'UNASSIGNED' | 'ON_HOLD';
}
