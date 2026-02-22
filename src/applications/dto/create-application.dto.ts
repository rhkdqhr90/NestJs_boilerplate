import {
  IsString,
  IsOptional,
  IsEmail,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { sanitizeTitle } from '../../common/utils/sanitize.util';

export class CreateApplicationDto {
  @IsString()
  postId: string;

  @IsString()
  @IsOptional()
  @MaxLength(3000)
  @Transform(sanitizeTitle)
  coverLetter?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  contactPhone?: string;

  @IsEmail()
  @IsOptional()
  contactEmail?: string;
}
