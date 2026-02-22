import { IsString, IsBoolean, IsOptional, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAnnouncementDto {
  @ApiProperty({ example: '서비스 업데이트 안내', description: '공지사항 제목' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title: string;

  @ApiProperty({ example: '새로운 기능이 추가되었습니다.', description: '공지사항 내용' })
  @IsString()
  @MinLength(10)
  @MaxLength(10000)
  content: string;

  @ApiPropertyOptional({ example: true, description: '상단 고정 여부' })
  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;

  @ApiPropertyOptional({ example: true, description: '공개 여부' })
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}
