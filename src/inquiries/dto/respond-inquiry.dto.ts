import { IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RespondInquiryDto {
  @ApiProperty({ description: '답변 내용', example: '문의에 대한 답변입니다.' })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  response: string;
}
