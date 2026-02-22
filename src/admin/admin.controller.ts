import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AdminService } from './admin.service';
import { OrphanCleanupService } from '../uploads/orphan-cleanup.service';
import { UploadsService } from '../uploads/uploads.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UpdateReportDto } from '../reports/dto/update-report.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { BulkDeletePostsDto } from './dto/bulk-delete-posts.dto';
import { ProcessVerificationDto } from '../verifications/dto/process-verification.dto';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { UserRole, ReportStatus, ReportType, VerificationStatus, PostCategory } from '@prisma/client';

const MAX_LIMIT = 100;

function parseLimit(limit?: string, defaultValue = 20): number {
  const parsed = limit ? parseInt(limit, 10) : defaultValue;
  return Math.min(Math.max(1, parsed), MAX_LIMIT);
}

function parsePage(page?: string): number {
  const parsed = page ? parseInt(page, 10) : 1;
  return Math.max(1, parsed);
}

@ApiTags('Admin')
@ApiBearerAuth('access-token')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Throttle({ default: { limit: 100, ttl: 60000 } })
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly orphanCleanupService: OrphanCleanupService,
    private readonly uploadsService: UploadsService,
  ) {}

  // ========================================
  // 대시보드
  // ========================================

  @Get('stats')
  async getStats() {
    return this.adminService.getStats();
  }

  // ========================================
  // 신고 관리
  // ========================================

  @Get('reports')
  async getReports(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: ReportStatus,
    @Query('type') type?: ReportType,
  ) {
    return this.adminService.getReports(
      parsePage(page),
      parseLimit(limit),
      status,
      type,
    );
  }

  @Get('reports/:id')
  async getReport(@Param('id') id: string) {
    return this.adminService.getReport(id);
  }

  @Patch('reports/:id')
  async processReport(
    @Param('id') id: string,
    @Req() req: Request,
    @Body() dto: UpdateReportDto,
  ) {
    const admin = req.user as JwtPayload;
    return this.adminService.processReport(id, admin.sub, dto);
  }

  // ========================================
  // 사용자 관리
  // ========================================

  @Get('users')
  async getUsers(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('role') role?: UserRole,
  ) {
    return this.adminService.getUsers(
      parsePage(page),
      parseLimit(limit),
      search,
      role,
    );
  }

  @Patch('users/:id/role')
  async updateUserRole(
    @Param('id') id: string,
    @Req() req: Request,
    @Body() dto: UpdateUserRoleDto,
  ) {
    const admin = req.user as JwtPayload;
    return this.adminService.updateUserRole(id, dto.role, admin.sub);
  }

  @Delete('users/:id')
  @HttpCode(HttpStatus.OK)
  async deleteUser(@Param('id') id: string) {
    return this.adminService.deleteUser(id);
  }

  // ========================================
  // 게시글 관리
  // ========================================

  @Get('posts')
  async getPosts(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('category') category?: PostCategory,
  ) {
    return this.adminService.getPosts(
      parsePage(page),
      parseLimit(limit),
      search,
      category,
    );
  }

  @Delete('posts/:id')
  @HttpCode(HttpStatus.OK)
  async deletePost(@Param('id') id: string) {
    return this.adminService.deletePost(id);
  }

  @Post('posts/bulk-delete')
  @HttpCode(HttpStatus.OK)
  async bulkDeletePosts(@Body() dto: BulkDeletePostsDto) {
    return this.adminService.bulkDeletePosts(dto.ids);
  }

  // ========================================
  // 댓글 관리
  // ========================================

  @Delete('comments/:id')
  @HttpCode(HttpStatus.OK)
  async deleteComment(@Param('id') id: string) {
    return this.adminService.deleteComment(id);
  }

  // ========================================
  // 파일 관리
  // ========================================

  @Post('cleanup-orphan-files')
  @HttpCode(HttpStatus.OK)
  async cleanupOrphanFiles() {
    const result = await this.orphanCleanupService.cleanupOrphanFiles();
    return {
      message: `고아 파일 정리 완료: ${result.deleted}개 삭제, ${result.errors}개 오류`,
      ...result,
    };
  }

  // ========================================
  // 인증 관리
  // ========================================

  @Get('verifications')
  async getVerifications(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: VerificationStatus,
  ) {
    return this.adminService.getVerifications(
      parsePage(page),
      parseLimit(limit),
      status,
    );
  }

  @Get('verifications/:id')
  async getVerification(@Param('id') id: string) {
    return this.adminService.getVerification(id);
  }

  @Patch('verifications/:id')
  async processVerification(
    @Param('id') id: string,
    @Req() req: Request,
    @Body() dto: ProcessVerificationDto,
  ) {
    const admin = req.user as JwtPayload;
    return this.adminService.processVerification(id, admin.sub, dto);
  }

  /**
   * 인증 파일 다운로드 (관리자 전용)
   * 보안: 정적 파일로 제공하지 않고 관리자 인증 후에만 접근 가능
   * - 암호화된 파일 복호화
   * - 접근 로그 기록
   */
  @Get('verifications/:id/file')
  async downloadVerificationFile(
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const admin = req.user as JwtPayload;
    const verification = await this.adminService.getVerification(id);

    // 접근 로그 기록
    await this.adminService.logVerificationAccess(
      id,
      admin.sub,
      'VIEW',
      req.ip || req.socket?.remoteAddress,
      req.headers['user-agent'],
    );

    // 파일 읽기 (암호화된 경우 복호화)
    const fileBuffer = await this.uploadsService.readVerificationFile(
      verification.fileUrl,
      verification.isEncrypted,
    );

    // Content-Type 설정
    res.setHeader('Content-Type', verification.fileType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(verification.originalFileName)}"`,
    );
    res.setHeader('Content-Length', fileBuffer.length);

    // 버퍼 전송
    res.send(fileBuffer);
  }

  /**
   * 인증 파일 접근 로그 조회
   */
  @Get('verifications/:id/logs')
  async getVerificationAccessLogs(@Param('id') id: string) {
    // 요청 존재 여부 확인
    await this.adminService.getVerification(id);
    return this.adminService.getVerificationAccessLogs(id);
  }
}
