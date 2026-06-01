import { IsArray, IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateConversationDto {
  @IsNotEmpty()
  @IsArray()
  @IsUUID(undefined, { each: true })
  participantIds: string[];

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsBoolean()
  isGroup?: boolean;
}
