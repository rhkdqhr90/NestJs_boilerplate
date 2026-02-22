import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { sanitizeTitle } from '../../common/utils/sanitize.util';

export class CreateVerificationRequestDto {
  @IsString()
  @MinLength(2, { message: '인증 유형은 최소 2자 이상 입력해주세요' })
  @MaxLength(50, { message: '인증 유형은 최대 50자까지 입력 가능합니다' })
  @Transform(sanitizeTitle)
  verificationType: string;

  @IsString()
  @IsOptional()
  @MaxLength(500, { message: '메모는 최대 500자까지 입력 가능합니다' })
  @Transform(sanitizeTitle)
  note?: string;
}
