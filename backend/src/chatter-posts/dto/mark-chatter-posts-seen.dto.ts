import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class MarkChatterPostsSeenDto {
  @Transform(({ value }) => {
    if (!Array.isArray(value)) return [];
    return value.filter((id) => typeof id === 'string' && id.trim());
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  postIds!: string[];
}
