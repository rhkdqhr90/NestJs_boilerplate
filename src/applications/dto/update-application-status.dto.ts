import {
  IsEnum,
  IsString,
  IsOptional,
  MaxLength,
} from 'class-validator';
import { ApplicationStatus } from '@prisma/client';

export class UpdateApplicationStatusDto {
  @IsEnum(ApplicationStatus)
  status: ApplicationStatus;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  recruiterNote?: string;
}
