import { IsEnum, IsString, IsOptional, MaxLength } from 'class-validator';
import { VerificationStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { sanitizeTitle } from '../../common/utils/sanitize.util';

export class ProcessVerificationDto {
  @IsEnum(VerificationStatus, { message: '유효하지 않은 상태입니다' })
  status: VerificationStatus;

  @IsString()
  @IsOptional()
  @MaxLength(500, { message: '반려 사유는 최대 500자까지 입력 가능합니다' })
  @Transform(sanitizeTitle)
  rejectionReason?: string;
}
