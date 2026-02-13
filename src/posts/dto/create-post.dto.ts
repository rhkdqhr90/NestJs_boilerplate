import {
  IsString,
  IsBoolean,
  IsEnum,
  IsOptional,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { PostCategory } from '@prisma/client';
import {
  sanitizeTitle,
  sanitizeContent,
} from '../../common/utils/sanitize.util';

export class CreatePostDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Transform(sanitizeTitle)
  title: string;

  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  @Transform(sanitizeContent)
  content: string;

  @IsEnum(PostCategory)
  @IsOptional()
  category?: PostCategory;

  @IsBoolean()
  @IsOptional()
  isAnonymous?: boolean;
}
