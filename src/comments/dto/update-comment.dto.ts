import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { sanitizeComment } from '../../common/utils/sanitize.util';

export class UpdateCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  @Transform(sanitizeComment)
  @IsOptional()
  content?: string;
}
