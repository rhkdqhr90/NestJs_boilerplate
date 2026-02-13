import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { sanitizeComment } from '../../common/utils/sanitize.util';

export class CreateCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  @Transform(sanitizeComment)
  content: string;

  // 대댓글인 경우 부모 댓글 ID (cuid 형식)
  @IsString()
  @MinLength(20)
  @MaxLength(30)
  @IsOptional()
  parentCommentId?: string;

  // 멘션할 유저 ID (cuid 형식)
  @IsString()
  @MinLength(20)
  @MaxLength(30)
  @IsOptional()
  mentionedUserId?: string;
}
