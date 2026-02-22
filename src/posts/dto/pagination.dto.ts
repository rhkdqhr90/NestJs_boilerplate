import { Type, Transform } from 'class-transformer';
import {
  IsInt,
  Min,
  Max,
  IsOptional,
  IsEnum,
  IsString,
  IsBoolean,
  IsArray,
  MaxLength,
} from 'class-validator';
import { PostCategory, JobSubCategory, Region, TherapyTag } from '@prisma/client';

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

  // === 구인공고 필터 ===
  @IsEnum(JobSubCategory)
  @IsOptional()
  jobSubCategory?: JobSubCategory;

  @IsEnum(Region)
  @IsOptional()
  region?: Region;

  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  @IsOptional()
  isRecruiting?: boolean;

  // 치료/교육 분야 태그 필터 (쉼표로 구분된 문자열 → 배열)
  @Transform(({ value }) => {
    if (!value) return undefined;
    if (Array.isArray(value)) return value;
    return typeof value === 'string' ? value.split(',').filter(Boolean) : undefined;
  })
  @IsArray()
  @IsEnum(TherapyTag, { each: true })
  @IsOptional()
  therapyTags?: TherapyTag[];
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
