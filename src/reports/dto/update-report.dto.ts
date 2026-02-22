import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ReportStatus, ReportAction } from '@prisma/client';

export class UpdateReportDto {
  @IsEnum(ReportStatus)
  @IsOptional()
  status?: ReportStatus;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  processingNote?: string;

  @IsEnum(ReportAction)
  @IsOptional()
  action?: ReportAction;
}
