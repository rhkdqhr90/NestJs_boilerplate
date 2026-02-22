import { IsString, IsOptional, IsBoolean, IsInt, IsEnum, IsDateString, MaxLength, MinLength, IsUrl, Matches } from 'class-validator';
import { BannerType } from '@prisma/client';

export class CreateBannerDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  title: string;

  @IsString()
  @MaxLength(2000)
  @Matches(/^(https?:\/\/|\/)/i, { message: 'imageUrl must be a valid URL or relative path' })
  imageUrl: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @IsUrl({}, { message: 'linkUrl must be a valid URL' })
  linkUrl?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  alt: string;

  @IsOptional()
  @IsEnum(BannerType)
  type?: BannerType;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
