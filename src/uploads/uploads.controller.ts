import {
  Controller,
  Post,
  Delete,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { UploadsService } from './uploads.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('uploads')
@UseGuards(JwtAuthGuard)
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  /**
   * 프로필 이미지 업로드
   */
  @Post('profile')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    }),
  )
  async uploadProfileImage(
    @Req() req: Request,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('파일이 없습니다');
    }

    const user = req.user as { sub: string };
    return this.uploadsService.updateProfileImage(user.sub, file);
  }

  /**
   * 프로필 이미지 삭제
   */
  @Delete('profile')
  async deleteProfileImage(@Req() req: Request) {
    const user = req.user as { sub: string };
    return this.uploadsService.deleteProfileImage(user.sub);
  }

  /**
   * 게시글 이미지 업로드 (에디터용)
   */
  @Post('post')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    }),
  )
  async uploadPostImage(
    @Req() req: Request,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('파일이 없습니다');
    }

    const user = req.user as { sub: string };
    const imageUrl = await this.uploadsService.saveFile(file, 'post', user.sub);
    return { imageUrl };
  }

  /**
   * 배너 이미지 업로드 (관리자 전용)
   */
  @Post('banner')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    }),
  )
  async uploadBannerImage(
    @Req() req: Request,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('파일이 없습니다');
    }

    const user = req.user as { sub: string };
    const imageUrl = await this.uploadsService.saveFile(file, 'banner', user.sub);
    return { imageUrl };
  }
}
