import {
  Controller,
  Get,
  Patch,
  Delete,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

// 페이지네이션 값 검증 헬퍼 함수
function sanitizePage(page?: string): number {
  const parsed = page ? parseInt(page, 10) : 1;
  return Number.isNaN(parsed) || parsed < 1 ? 1 : parsed;
}

function sanitizeLimit(limit?: string, defaultLimit = 20, maxLimit = 100): number {
  const parsed = limit ? parseInt(limit, 10) : defaultLimit;
  if (Number.isNaN(parsed) || parsed < 1) return defaultLimit;
  return Math.min(parsed, maxLimit);
}

@ApiTags('Users')
@ApiBearerAuth('access-token')
@Controller('users')
@UseGuards(JwtAuthGuard) // 전체 인증 필요
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ========================================
  // 1. 내 프로필 조회
  // ========================================
  @Get('me')
  @ApiOperation({ summary: '내 프로필 조회', description: '로그인한 사용자의 프로필을 조회합니다.' })
  @ApiResponse({ status: 200, description: '프로필 조회 성공', type: UserResponseDto })
  async getProfile(@Req() req: Request): Promise<UserResponseDto> {
    const user = req.user as JwtPayload;
    const profile = await this.usersService.findOne(user.sub);
    return new UserResponseDto(profile);
  }

  // ========================================
  // 2. 프로필 수정
  // ========================================
  @Patch('me')
  @Throttle({ default: { ttl: 60000, limit: 10 } }) // 1분에 10번
  async updateProfile(
    @Req() req: Request,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    const user = req.user as JwtPayload;
    const updatedUser = await this.usersService.update(user.sub, updateUserDto);
    return new UserResponseDto(updatedUser);
  }

  // ========================================
  // 3. 비밀번호 변경
  // ========================================
  @Patch('me/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { ttl: 60000, limit: 3 } }) // 1분에 3번 (보안 민감)
  async changePassword(
    @Req() req: Request,
    @Body() changePasswordDto: ChangePasswordDto,
  ): Promise<void> {
    const user = req.user as JwtPayload;
    await this.usersService.changePassword(user.sub, changePasswordDto);
  }

  // ========================================
  // 4. 내가 쓴 글 조회
  // ========================================
  @Get('me/posts')
  async getMyPosts(
    @Req() req: Request,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const user = req.user as JwtPayload;
    return this.usersService.getMyPosts(user.sub, {
      page: sanitizePage(page),
      limit: sanitizeLimit(limit),
    });
  }

  // ========================================
  // 5. 내가 쓴 댓글 조회
  // ========================================
  @Get('me/comments')
  async getMyComments(
    @Req() req: Request,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const user = req.user as JwtPayload;
    return this.usersService.getMyComments(user.sub, {
      page: sanitizePage(page),
      limit: sanitizeLimit(limit),
    });
  }

  // ========================================
  // 6. 내 북마크 조회
  // ========================================
  @Get('me/bookmarks')
  async getMyBookmarks(
    @Req() req: Request,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const user = req.user as JwtPayload;
    return this.usersService.getMyBookmarks(user.sub, {
      page: sanitizePage(page),
      limit: sanitizeLimit(limit),
    });
  }

  // ========================================
  // 7. 내가 좋아요한 글 조회
  // ========================================
  @Get('me/likes')
  async getMyLikes(
    @Req() req: Request,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const user = req.user as JwtPayload;
    return this.usersService.getMyLikes(user.sub, {
      page: sanitizePage(page),
      limit: sanitizeLimit(limit),
    });
  }

  // ========================================
  // 8. 사용자 검색 (멘션용)
  // ========================================
  @Get('search')
  @Throttle({ default: { ttl: 60000, limit: 30 } }) // 1분에 30번
  async searchUsers(
    @Query('q') query: string,
    @Query('limit') limit?: string,
  ) {
    return this.usersService.searchUsers(
      query || '',
      sanitizeLimit(limit, 10, 20), // 기본 10, 최대 20
    );
  }

  // ========================================
  // 8. 대시보드 통계
  // ========================================
  @Get('me/dashboard-stats')
  async getDashboardStats(@Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.usersService.getDashboardStats(user.sub);
  }

  // ========================================
  // 9. 최근 활동
  // ========================================
  @Get('me/recent-activity')
  async getRecentActivity(
    @Req() req: Request,
    @Query('limit') limit?: string,
  ) {
    const user = req.user as JwtPayload;
    return this.usersService.getRecentActivity(
      user.sub,
      sanitizeLimit(limit, 5, 20),
    );
  }

  // ========================================
  // 10. 회원 탈퇴 (비밀번호 확인!)
  // ========================================
  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { ttl: 60000, limit: 2 } }) // 1분에 2번 (매우 민감)
  async deleteAccount(
    @Req() req: Request,
    @Body() deleteAccountDto: DeleteAccountDto,
  ): Promise<void> {
    const user = req.user as JwtPayload;
    await this.usersService.remove(user.sub, deleteAccountDto.password);
  }
}
