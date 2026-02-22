import { IsEmail, IsString, IsEnum, MinLength, MaxLength, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InquiryType } from '@prisma/client';

export class CreateInquiryDto {
  @ApiProperty({ enum: InquiryType, description: '문의 유형' })
  @IsEnum(InquiryType)
  type: InquiryType;

  @ApiProperty({ example: 'user@example.com', description: '답변 받을 이메일' })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({ example: '로그인 관련 문의', description: '제목' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  subject: string;

  @ApiProperty({ example: '로그인이 되지 않습니다.', description: '문의 내용' })
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  content: string;

  @ApiPropertyOptional({ description: '회원 ID (로그인 상태)' })
  @IsOptional()
  @IsString()
  userId?: string;
}
