import { IsArray, ArrayMinSize, ArrayMaxSize, IsString, Matches } from 'class-validator';

export class BulkDeletePostsDto {
  @IsArray()
  @ArrayMinSize(1, { message: '삭제할 게시글을 선택해주세요' })
  @ArrayMaxSize(100, { message: '한 번에 최대 100개까지 삭제할 수 있습니다' })
  @IsString({ each: true })
  @Matches(/^c[a-z0-9]{24,}$/i, { each: true, message: '유효하지 않은 게시글 ID입니다' })
  ids: string[];
}
