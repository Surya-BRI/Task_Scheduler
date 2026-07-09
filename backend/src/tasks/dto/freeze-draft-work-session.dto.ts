import { IsUUID } from 'class-validator';

export class FreezeDraftWorkSessionDto {
  @IsUUID()
  designerId: string;
}
