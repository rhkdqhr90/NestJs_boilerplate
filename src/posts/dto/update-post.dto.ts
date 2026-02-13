import {
  IsString,
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

export class UpdatePostDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Transform(sanitizeTitle)
  @IsOptional()
  title?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  @Transform(sanitizeContent)
  @IsOptional()
  content?: string;

  @IsEnum(PostCategory)
  @IsOptional()
  category?: PostCategory;
}
