import { IsArray, IsBoolean, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class CreateConversationDto {
  // ERP ErpAuthUsers.userId is a decimal bigint, not a GUID.
  @IsNotEmpty()
  @IsArray()
  @Matches(/^\d+$/, { each: true })
  participantIds: string[];

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsBoolean()
  isGroup?: boolean;
}
