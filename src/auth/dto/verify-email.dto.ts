import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class VerifyEmailDto {
  @IsString()
  @IsNotEmpty({ message: '인증 코드를 입력해주세요' })
  @Matches(/^\d{6}$/, { message: '6자리 숫자 코드를 입력해주세요' })
  code: string;
}
