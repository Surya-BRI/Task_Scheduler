import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class FreezeDraftWorkSessionDto {
  @IsUUID()
  designerId: string;

  /** When false, returns worked time without closing the session (multi-slice handoff). */
  @IsOptional()
  @IsBoolean()
  closeSession?: boolean;
}
