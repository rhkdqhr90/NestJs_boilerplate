import { IsString, IsEnum, IsOptional, MinLength, MaxLength } from 'class-validator';
import { ReportType } from '@prisma/client';

export class CreateReportDto {
  @IsEnum(ReportType)
  type: ReportType;

  @IsString()
  @MinLength(2, { message: '신고 사유를 입력해주세요' })
  @MaxLength(1000, { message: '신고 사유는 최대 1000자까지 입력 가능합니다' })
  reason: string;

  @IsString()
  @IsOptional()
  targetUserId?: string;

  @IsString()
  @IsOptional()
  targetPostId?: string;

  @IsString()
  @IsOptional()
  targetCommentId?: string;
}
