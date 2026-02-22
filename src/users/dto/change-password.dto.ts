import {
  IsString,
  MinLength,
  MaxLength,
  Matches,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

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

export class ChangePasswordDto {
  @IsString()
  @MinLength(8)
  currentPassword: string;

  @IsString()
  @MinLength(8)
  @MaxLength(100)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}$/, {
    message:
      '비밀번호는 영문, 숫자, 특수문자를 각각 1개 이상 포함해야 합니다',
  })
  @Validate(IsNotCommonPassword)
  newPassword: string;
}
