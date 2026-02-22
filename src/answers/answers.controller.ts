import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Request } from 'express';
import { AnswersService } from './answers.service';
import { CreateAnswerDto } from './dto/create-answer.dto';
import { UpdateAnswerDto } from './dto/update-answer.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@Controller('posts/:postId/answers')
export class AnswersController {
  constructor(private readonly answersService: AnswersService) {}

  // ========================================
  // 1. 답변 목록 조회 (공개)
  // ========================================
  @Get()
  async findAll(@Param('postId') postId: string) {
    return this.answersService.findByPostId(postId);
  }

  // ========================================
  // 2. 답변 작성 (전문가만)
  // ========================================
  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @Param('postId') postId: string,
    @Req() req: Request,
    @Body() createAnswerDto: CreateAnswerDto,
  ) {
    const user = req.user as JwtPayload;
    return this.answersService.create(postId, user.sub, createAnswerDto);
  }

  // ========================================
  // 3. 답변 수정 (작성자만)
  // ========================================
  @Patch(':answerId')
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('answerId') answerId: string,
    @Req() req: Request,
    @Body() updateAnswerDto: UpdateAnswerDto,
  ) {
    const user = req.user as JwtPayload;
    return this.answersService.update(answerId, user.sub, updateAnswerDto);
  }

  // ========================================
  // 4. 답변 삭제 (작성자/관리자만)
  // ========================================
  @Delete(':answerId')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('answerId') answerId: string, @Req() req: Request) {
    const user = req.user as JwtPayload;
    const isAdmin = user.role === 'ADMIN';
    await this.answersService.remove(answerId, user.sub, isAdmin);
  }

  // ========================================
  // 5. 베스트 답변 선택 (질문 작성자만)
  // ========================================
  @Patch(':answerId/best')
  @UseGuards(JwtAuthGuard)
  async selectBest(@Param('answerId') answerId: string, @Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.answersService.selectBest(answerId, user.sub);
  }
}
