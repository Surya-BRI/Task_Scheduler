import { IsBoolean, IsOptional, Matches } from 'class-validator';

export class FreezeDraftWorkSessionDto {
  // ERP ErpAuthUsers.userId is a decimal bigint, not a GUID.
  @Matches(/^\d+$/)
  designerId: string;

  /** When false, returns worked time without closing the session (multi-slice handoff). */
  @IsOptional()
  @IsBoolean()
  closeSession?: boolean;
}
