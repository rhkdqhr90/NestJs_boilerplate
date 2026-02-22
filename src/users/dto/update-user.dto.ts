import {
  IsOptional,
  IsString,
  IsEmail,
  IsUrl,
  IsEnum,
  IsInt,
  MinLength,
  MaxLength,
  Min,
  Max,
  ValidateIf,
} from 'class-validator';
import { JobType } from '@prisma/client';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  nickname?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  // 이메일 변경 시 현재 비밀번호 필수 (보안 강화)
  @ValidateIf((o) => o.email !== undefined)
  @IsString()
  @MinLength(1, { message: '이메일 변경 시 현재 비밀번호가 필요합니다' })
  currentPassword?: string;

  @IsOptional()
  @IsUrl()
  profileImage?: string;

  @IsOptional()
  @IsEnum(JobType, { message: '올바른 직업 유형을 선택해주세요' })
  jobType?: JobType;

  @IsOptional()
  @IsInt({ message: '경력은 정수로 입력해주세요' })
  @Min(0, { message: '경력은 0 이상이어야 합니다' })
  @Max(50, { message: '경력은 50 이하여야 합니다' })
  career?: number;
}
