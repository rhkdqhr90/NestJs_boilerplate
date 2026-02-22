import { IsString, MinLength, MaxLength, IsOptional } from 'class-validator';

export class UpdateAnswerDto {
  @IsOptional()
  @IsString()
  @MinLength(10, { message: '답변은 최소 10자 이상이어야 합니다' })
  @MaxLength(10000, { message: '답변은 최대 10000자까지 작성할 수 있습니다' })
  content?: string;
}
