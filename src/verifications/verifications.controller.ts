import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { VerificationsService } from './verifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CreateVerificationRequestDto } from './dto/create-verification-request.dto';

@Controller('verifications')
@UseGuards(JwtAuthGuard)
export class VerificationsController {
  constructor(private readonly verificationsService: VerificationsService) {}

  /**
   * 인증 요청 생성
   */
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    }),
  )
  async create(
    @Req() req: Request,
    @Body() dto: CreateVerificationRequestDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('인증 서류 파일을 첨부해주세요');
    }

    const user = req.user as JwtPayload;
    return this.verificationsService.create(user.sub, dto, file);
  }

  /**
   * 내 인증 요청 목록
   */
  @Get('my')
  getMyRequests(@Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.verificationsService.findMyRequests(user.sub);
  }

  /**
   * 내 최신 인증 상태
   */
  @Get('my/status')
  async getMyStatus(@Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.verificationsService.getMyLatestStatus(user.sub);
  }
}
