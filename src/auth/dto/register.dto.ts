import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  Matches,
  IsEnum,
  IsInt,
  IsOptional,
  Min,
  Max,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  IsBoolean,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { JobType } from '@prisma/client';

// 일반적인 취약 비밀번호 목록
const COMMON_PASSWORDS = [
  'password',
  '12345678',
  '123456789',
  'qwerty123',
  'password1',
  'iloveyou',
  'admin123',
  'welcome1',
  'monkey123',
  'dragon12',
  'master12',
  'letmein1',
  'sunshine',
  'princess',
  'football',
];

@ValidatorConstraint({ name: 'isNotCommonPassword', async: false })
class IsNotCommonPassword implements ValidatorConstraintInterface {
  validate(password: string): boolean {
    return !COMMON_PASSWORDS.includes(password?.toLowerCase());
  }

  defaultMessage(): string {
    return '일반적으로 사용되는 취약한 비밀번호는 사용할 수 없습니다';
  }
}

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com', description: '이메일 주소' })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({ example: 'Password1!', description: '비밀번호 (8자 이상, 영문+숫자+특수문자)' })
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}$/, {
    message:
      '비밀번호는 영문, 숫자, 특수문자를 각각 1개 이상 포함해야 합니다',
  })
  @Validate(IsNotCommonPassword)
  password: string;

  @ApiProperty({ example: '홍길동', description: '닉네임' })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  nickname: string;

  @ApiPropertyOptional({ enum: JobType, description: '직종' })
  @IsOptional()
  @IsEnum(JobType)
  jobType?: JobType;

  @ApiPropertyOptional({ example: 5, description: '경력 (년)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50)
  career?: number;

  @ApiProperty({ example: true, description: '이용약관 동의 여부' })
  @IsBoolean()
  agreedTerms: boolean;

  @ApiProperty({ example: true, description: '개인정보처리방침 동의 여부' })
  @IsBoolean()
  agreedPrivacy: boolean;
}
