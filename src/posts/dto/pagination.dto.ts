import { Type } from 'class-transformer';
import {
  IsInt,
  Min,
  Max,
  IsOptional,
  IsEnum,
  IsString,
  MaxLength,
} from 'class-validator';
import { PostCategory } from '@prisma/client';

export class PaginationDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000) // ✅ DOS 방지
  @IsOptional()
  page: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit: number = 20;

  @IsEnum(PostCategory)
  @IsOptional()
  category?: PostCategory;

  @IsString()
  @MaxLength(100) // ✅ 검색어 길이 제한
  @IsOptional()
  search?: string;

  @IsEnum(['createdAt', 'viewCount', 'likeCount'])
  @IsOptional()
  sort: 'createdAt' | 'viewCount' | 'likeCount' = 'createdAt';

  @IsEnum(['asc', 'desc'])
  @IsOptional()
  order: 'asc' | 'desc' = 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
