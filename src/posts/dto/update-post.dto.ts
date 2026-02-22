import {
  IsString,
  IsEnum,
  IsOptional,
  IsInt,
  IsBoolean,
  IsEmail,
  IsDateString,
  IsArray,
  ArrayMaxSize,
  Min,
  Max,
  MinLength,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { PostCategory, JobSubCategory, Region, SalaryType, EmploymentType, TherapyTag } from '@prisma/client';
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

  // isAnonymous는 수정 시 변경 불가 (책임 회피 방지)

  // === 구인공고 전용 필드 (기존) ===
  @IsEnum(JobSubCategory)
  @IsOptional()
  @ValidateIf((o) => o.category === PostCategory.JOB_POSTING)
  jobSubCategory?: JobSubCategory;

  @IsEnum(Region)
  @IsOptional()
  @ValidateIf((o) => o.category === PostCategory.JOB_POSTING)
  region?: Region;

  @IsEnum(SalaryType)
  @IsOptional()
  @ValidateIf((o) => o.category === PostCategory.JOB_POSTING)
  salaryType?: SalaryType;

  @IsInt()
  @Min(0)
  @IsOptional()
  @ValidateIf((o) => o.category === PostCategory.JOB_POSTING && o.salaryType !== SalaryType.NEGOTIABLE)
  salaryMin?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  @ValidateIf((o) => o.category === PostCategory.JOB_POSTING && o.salaryType !== SalaryType.NEGOTIABLE)
  salaryMax?: number;

  @IsBoolean()
  @IsOptional()
  @ValidateIf((o) => o.category === PostCategory.JOB_POSTING)
  isRecruiting?: boolean;

  // === 1순위: 핵심 채용 정보 ===
  @IsString()
  @MaxLength(100)
  @IsOptional()
  @ValidateIf((o) => o.category === PostCategory.JOB_POSTING)
  organizationName?: string;

  @IsString()
  @MaxLength(20)
  @IsOptional()
  @ValidateIf((o) => o.category === PostCategory.JOB_POSTING)
  contactPhone?: string;

  @IsEmail()
  @IsOptional()
  @ValidateIf((o) => o.category === PostCategory.JOB_POSTING)
  contactEmail?: string;

  @IsString()
  @MaxLength(50)
  @IsOptional()
  @ValidateIf((o) => o.category === PostCategory.JOB_POSTING)
  contactKakao?: string;

  @IsDateString()
  @IsOptional()
  @ValidateIf((o) => o.category === PostCategory.JOB_POSTING)
  deadline?: string;

  @IsBoolean()
  @IsOptional()
  isAutoClose?: boolean;

  @IsInt()
  @Min(1)
  @Max(1000)
  @IsOptional()
  @ValidateIf((o) => o.category === PostCategory.JOB_POSTING)
  recruitCount?: number;

  @IsString()
  @MaxLength(50)
  @IsOptional()
  @ValidateIf((o) => o.category === PostCategory.JOB_POSTING)
  workingHours?: string;

  // === 2순위: 상세 정보 ===
  @IsEnum(EmploymentType)
  @IsOptional()
  @ValidateIf((o) => o.category === PostCategory.JOB_POSTING)
  employmentType?: EmploymentType;

  @IsString()
  @MaxLength(2000)
  @IsOptional()
  @ValidateIf((o) => o.category === PostCategory.JOB_POSTING)
  benefits?: string;

  @IsString()
  @MaxLength(2000)
  @IsOptional()
  @ValidateIf((o) => o.category === PostCategory.JOB_POSTING)
  requirements?: string;

  @IsString()
  @MaxLength(200)
  @IsOptional()
  @ValidateIf((o) => o.category === PostCategory.JOB_POSTING)
  detailAddress?: string;

  // === 치료/교육 분야 태그 (다중 선택) ===
  @IsArray()
  @IsEnum(TherapyTag, { each: true })
  @ArrayMaxSize(8, { message: '태그는 최대 8개까지 선택 가능합니다' })
  @IsOptional()
  @ValidateIf((o) => o.category === PostCategory.JOB_POSTING)
  therapyTags?: TherapyTag[];
}
