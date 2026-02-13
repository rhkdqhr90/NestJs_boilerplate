import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { PostsService } from './posts.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { PaginationDto } from './dto/pagination.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

/**
 * 클라이언트 실제 IP 주소 추출
 * trust proxy 설정과 함께 사용
 */
function getClientIp(req: Request): string {
  // Express trust proxy 설정 시 req.ip가 실제 클라이언트 IP를 반환
  return req.ip || '0.0.0.0';
}

@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  // ========================================
  // 1. 게시글 작성 (인증 필요)
  // ========================================
  @Post()
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // ✅ 10회/분
  @HttpCode(HttpStatus.CREATED)
  async create(@Req() req: Request, @Body() createPostDto: CreatePostDto) {
    const user = req.user as JwtPayload;
    const ip = getClientIp(req); // ✅ IP 추출
    return this.postsService.create(user.sub, createPostDto, ip);
  }

  // ========================================
  // 2. 게시글 목록 조회 (인증 불필요)
  // ========================================
  @Get()
  async findAll(@Query() pagination: PaginationDto) {
    return this.postsService.findAll(pagination);
  }

  // ========================================
  // 3. 게시글 상세 조회 (인증 불필요)
  // ========================================
  @Get(':id')
  @Throttle({ default: { limit: 20, ttl: 60000 } }) // ✅ 20회/분 (조회수 조작 방지)
  async findOne(@Param('id') id: string) {
    return this.postsService.findOne(id);
  }

  // ========================================
  // 4. 게시글 수정 (인증 필요, 작성자만)
  // ========================================
  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Req() req: Request,
    @Body() updatePostDto: UpdatePostDto,
  ) {
    const user = req.user as JwtPayload;
    return this.postsService.update(id, user.sub, updatePostDto);
  }

  // ========================================
  // 5. 게시글 삭제 (인증 필요, 작성자만)
  // ========================================
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @Req() req: Request) {
    const user = req.user as JwtPayload;
    const ip = getClientIp(req); //  IP 추출
    await this.postsService.remove(id, user.sub, ip);
  }

  // ========================================
  // 6. 좋아요 토글 (인증 필요)
  // ========================================
  @Post(':id/like')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } }) // ✅ 30회/분
  async toggleLike(@Param('id') id: string, @Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.postsService.toggleLike(id, user.sub);
  }
}
