import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { InquiryStatus } from '@prisma/client';

export class UpdateInquiryStatusDto {
  @ApiProperty({ enum: InquiryStatus, description: '문의 상태' })
  @IsEnum(InquiryStatus)
  status: InquiryStatus;
}
