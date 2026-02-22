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
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PostsService } from './posts.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { PaginationDto } from './dto/pagination.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

/**
 * IPv4 주소 유효성 검증 (각 옥텟 0-255 범위 체크)
 */
function isValidIPv4(ip: string): boolean {
  // ::ffff: 프리픽스 제거
  const cleanIp = ip.replace(/^::ffff:/i, '');
  const parts = cleanIp.split('.');
  if (parts.length !== 4) return false;

  return parts.every((part) => {
    const num = parseInt(part, 10);
    return !isNaN(num) && num >= 0 && num <= 255 && part === String(num);
  });
}

/**
 * IPv6 주소 유효성 검증 (압축 형식 지원: ::, ::1, 2001:db8::1 등)
 */
function isValidIPv6(ip: string): boolean {
  // IPv4-mapped IPv6 주소는 별도 처리
  if (ip.toLowerCase().startsWith('::ffff:')) {
    return isValidIPv4(ip);
  }

  // :: (더블 콜론)은 한 번만 허용
  const doubleColonCount = (ip.match(/::/g) || []).length;
  if (doubleColonCount > 1) return false;

  // 압축 형식 확장
  let expanded = ip;
  if (ip.includes('::')) {
    const parts = ip.split('::');
    const left = parts[0] ? parts[0].split(':') : [];
    const right = parts[1] ? parts[1].split(':') : [];
    const missing = 8 - left.length - right.length;
    if (missing < 0) return false;
    const middle = Array(missing).fill('0');
    expanded = [...left, ...middle, ...right].join(':');
  }

  const segments = expanded.split(':');
  if (segments.length !== 8) return false;

  return segments.every((seg) => {
    if (seg.length === 0 || seg.length > 4) return false;
    return /^[0-9a-fA-F]+$/.test(seg);
  });
}

/**
 * 클라이언트 실제 IP 주소 추출 (보안 강화)
 * trust proxy 설정과 함께 사용
 *
 * 보안:
 * - Express trust proxy 설정에 의해 신뢰할 수 있는 프록시만 허용
 * - IP 형식 검증으로 스푸핑된 헤더 값 방지
 * - IPv4 (0-255 범위) 및 IPv6 (압축 형식 포함) 지원
 */
function getClientIp(req: Request): string {
  const ip = req.ip;

  if (!ip) {
    return '0.0.0.0';
  }

  // IPv4 검증 (::ffff: 프리픽스 포함)
  if (ip.includes('.')) {
    if (isValidIPv4(ip)) {
      return ip;
    }
    return '0.0.0.0';
  }

  // IPv6 검증 (압축 형식 지원)
  if (isValidIPv6(ip)) {
    return ip;
  }

  // 유효하지 않은 IP 형식인 경우 (스푸핑 시도 가능)
  // 기본값 반환 (로깅은 서비스에서 필요시 수행)
  return '0.0.0.0';
}

@ApiTags('Posts')
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
  // 2-1. 인기글 조회 (최근 24시간, 조회수+좋아요 기준)
  // ========================================
  @Get('hot')
  async getHotPosts() {
    return this.postsService.getHotPosts();
  }

  // ========================================
  // 2-2. 카테고리별 프리뷰 조회 (홈 화면용 - 단일 API)
  // ========================================
  @Get('category-previews')
  async getCategoryPreviews(
    @Query('categories') categories: string,
    @Query('limit') limit?: string,
  ) {
    const categoryList = categories ? categories.split(',') : [];
    const parsedLimit = limit ? parseInt(limit, 10) : 3;
    return this.postsService.getCategoryPreviews(categoryList, parsedLimit);
  }

  // ========================================
  // 3. 게시글 상세 조회 (인증 불필요)
  // ========================================
  @Get(':id')
  @Throttle({ default: { limit: 20, ttl: 60000 } }) // ✅ 20회/분 (조회수 조작 방지)
  async findOne(@Param('id') id: string, @Req() req: Request) {
    const ip = getClientIp(req);
    return this.postsService.findOne(id, ip);
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

  // ========================================
  // 7. 북마크 토글 (인증 필요)
  // ========================================
  @Post(':id/bookmark')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async toggleBookmark(@Param('id') id: string, @Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.postsService.toggleBookmark(id, user.sub);
  }

  // ========================================
  // 8. 북마크 상태 확인 (인증 필요)
  // ========================================
  @Get(':id/bookmark')
  @UseGuards(JwtAuthGuard)
  async getBookmarkStatus(@Param('id') id: string, @Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.postsService.getBookmarkStatus(id, user.sub);
  }

  // ========================================
  // 9. 좋아요 상태 확인 (인증 필요)
  // ========================================
  @Get(':id/like')
  @UseGuards(JwtAuthGuard)
  async getLikeStatus(@Param('id') id: string, @Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.postsService.getLikeStatus(id, user.sub);
  }
}
