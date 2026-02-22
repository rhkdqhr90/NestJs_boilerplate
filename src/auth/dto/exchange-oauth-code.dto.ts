import { IsString, MinLength, MaxLength } from 'class-validator';

export class ExchangeOAuthCodeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  code: string;
}
