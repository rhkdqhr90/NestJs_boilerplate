import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ReportsService } from '../reports/reports.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UploadsService } from '../uploads/uploads.service';
import { UpdateReportDto } from '../reports/dto/update-report.dto';
import { ProcessVerificationDto } from '../verifications/dto/process-verification.dto';
import { ReportStatus, ReportType, UserRole, VerificationStatus, NotificationType, PostCategory } from '@prisma/client';
import { safeDecrementCommentCount, safeDecrementLikeCount } from '../common/utils/counter.util';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private reportsService: ReportsService,
    private notificationsService: NotificationsService,
    private uploadsService: UploadsService,
  ) {}

  /**
   * 대시보드 통계
   */
  async getStats() {
    const [
      totalUsers,
      totalPosts,
      totalComments,
      pendingReports,
      pendingVerifications,
      todayUsers,
      todayPosts,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.post.count(),
      this.prisma.comment.count(),
      this.reportsService.getPendingCount(),
      this.prisma.verificationRequest.count({
        where: { status: VerificationStatus.PENDING },
      }),
      this.prisma.user.count({
        where: {
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
      }),
      this.prisma.post.count({
        where: {
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
      }),
    ]);

    return {
      totalUsers,
      totalPosts,
      totalComments,
      pendingReports,
      pendingVerifications,
      todayUsers,
      todayPosts,
    };
  }

  /**
   * 신고 목록 조회
   */
  async getReports(
    page = 1,
    limit = 20,
    status?: ReportStatus,
    type?: ReportType,
  ) {
    return this.reportsService.findAll(page, limit, status, type);
  }

  /**
   * 신고 상세 조회
   */
  async getReport(id: string) {
    return this.reportsService.findOne(id);
  }

  /**
   * 신고 처리
   */
  async processReport(id: string, adminId: string, dto: UpdateReportDto) {
    return this.reportsService.process(id, adminId, dto);
  }

  /**
   * 사용자 목록 조회
   */
  async getUsers(
    page = 1,
    limit = 20,
    search?: string,
    role?: UserRole,
  ) {
    const skip = (page - 1) * limit;
    const where = {
      ...(search && {
        OR: [
          { email: { contains: search, mode: 'insensitive' as const } },
          { nickname: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
      ...(role && { role }),
    };

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          email: true,
          nickname: true,
          role: true,
          isVerified: true,
          jobType: true,
          career: true,
          provider: true,
          createdAt: true,
          lastLoginAt: true,
          _count: {
            select: {
              posts: true,
              comments: true,
              reportsReceived: true,
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * 사용자 역할 변경
   */
  async updateUserRole(userId: string, role: UserRole, adminId: string) {
    // 자기 자신의 권한 변경 방지
    if (userId === adminId) {
      throw new BadRequestException('자신의 권한은 변경할 수 없습니다');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { role },
      select: {
        id: true,
        email: true,
        nickname: true,
        role: true,
      },
    });
  }

  /**
   * 사용자 삭제 (관리자)
   * 비정규화 카운터(commentCount, likeCount) 조정 후 삭제
   */
  async deleteUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다');
    }

    // ADMIN은 삭제 불가 (안전장치)
    if (user.role === UserRole.ADMIN) {
      throw new BadRequestException('관리자 계정은 삭제할 수 없습니다');
    }

    await this.prisma.$transaction(async (tx) => {
      // 1. 사용자의 댓글이 속한 게시글들의 commentCount 조정
      const userComments = await tx.comment.findMany({
        where: { authorId: userId },
        select: { id: true, postId: true },
      });

      const commentCountByPost = new Map<string, number>();
      for (const comment of userComments) {
        const current = commentCountByPost.get(comment.postId) || 0;
        commentCountByPost.set(comment.postId, current + 1);
      }

      for (const [postId, count] of commentCountByPost) {
        await safeDecrementCommentCount(tx, postId, count).catch(() => {
          // 게시글이 이미 삭제된 경우 무시
        });
      }

      // 2. 사용자의 좋아요가 속한 게시글들의 likeCount 조정
      const userLikes = await tx.like.findMany({
        where: { userId },
        select: { postId: true },
      });

      const likeCountByPost = new Map<string, number>();
      for (const like of userLikes) {
        const current = likeCountByPost.get(like.postId) || 0;
        likeCountByPost.set(like.postId, current + 1);
      }

      for (const [postId, count] of likeCountByPost) {
        await safeDecrementLikeCount(tx, postId, count).catch(() => {
          // 게시글이 이미 삭제된 경우 무시
        });
      }

      // 3. 사용자 삭제 (Cascade로 연관 데이터도 삭제)
      await tx.user.delete({
        where: { id: userId },
      });
    });

    return { message: '사용자가 삭제되었습니다' };
  }

  /**
   * 게시글 삭제 (관리자)
   * 게시글 이미지 정리 후 삭제
   */
  async deletePost(postId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
    });

    if (!post) {
      throw new NotFoundException('게시글을 찾을 수 없습니다');
    }

    // 게시글 이미지 정리
    await this.deletePostImages(post.content);

    await this.prisma.post.delete({
      where: { id: postId },
    });

    return { message: '게시글이 삭제되었습니다' };
  }

  /**
   * 댓글 삭제 (관리자)
   * 트랜잭션으로 댓글 삭제 + commentCount 차감 (대댓글 포함)
   */
  async deleteComment(commentId: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
    });

    if (!comment) {
      throw new NotFoundException('댓글을 찾을 수 없습니다');
    }

    await this.prisma.$transaction(async (tx) => {
      // 대댓글 수 조회 (cascade 삭제될 대댓글 포함)
      const replyCount = await tx.comment.count({
        where: { parentCommentId: commentId },
      });

      // 댓글 삭제 (Cascade로 대댓글도 삭제)
      await tx.comment.delete({
        where: { id: commentId },
      });

      // commentCount 안전 차감 (본인 + 대댓글, 음수 방지)
      await safeDecrementCommentCount(tx, comment.postId, 1 + replyCount);
    });

    return { message: '댓글이 삭제되었습니다' };
  }

  /**
   * 게시글 목록 조회 (관리자)
   */
  async getPosts(page = 1, limit = 20, search?: string, category?: PostCategory) {
    const skip = (page - 1) * limit;
    const where: any = {};

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' as const } },
        { content: { contains: search, mode: 'insensitive' as const } },
      ];
    }

    if (category) {
      where.category = category;
    }

    const [data, total] = await Promise.all([
      this.prisma.post.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          title: true,
          category: true,
          isAnonymous: true,
          viewCount: true,
          likeCount: true,
          commentCount: true,
          createdAt: true,
          author: {
            select: { id: true, nickname: true, email: true },
          },
          _count: {
            select: { reports: true },
          },
        },
      }),
      this.prisma.post.count({ where }),
    ]);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * 게시글 일괄 삭제 (관리자)
   * 참고: DTO에서 배열 크기 및 ID 형식 검증 수행
   * 이미지 정리 후 삭제
   */
  async bulkDeletePosts(ids: string[]) {
    // 삭제 전 이미지 정리를 위해 content 조회
    const posts = await this.prisma.post.findMany({
      where: { id: { in: ids } },
      select: { content: true },
    });

    // 이미지 정리 (실패해도 삭제 진행)
    for (const post of posts) {
      await this.deletePostImages(post.content);
    }

    const result = await this.prisma.post.deleteMany({
      where: { id: { in: ids } },
    });

    return {
      message: `${result.count}개의 게시글이 삭제되었습니다`,
      deletedCount: result.count,
    };
  }

  /**
   * 게시글 HTML 콘텐츠에서 이미지 URL 추출 후 삭제 (헬퍼)
   */
  private async deletePostImages(content: string): Promise<void> {
    try {
      const imageUrlRegex = /\/uploads\/post\/[a-zA-Z0-9_\-.]+/g;
      const matches = content.match(imageUrlRegex);
      if (!matches || matches.length === 0) return;
      const uniqueUrls = [...new Set(matches)];
      await Promise.all(
        uniqueUrls.map((url) => this.uploadsService.deleteFile(url)),
      );
    } catch {
      // 이미지 삭제 실패는 무시 (게시글 삭제는 진행)
    }
  }

  // ========================================
  // 인증 관리
  // ========================================

  /**
   * 인증 요청 목록 조회
   */
  async getVerifications(
    page = 1,
    limit = 20,
    status?: VerificationStatus,
  ) {
    const skip = (page - 1) * limit;
    const where = status ? { status } : {};

    const [data, total] = await Promise.all([
      this.prisma.verificationRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              nickname: true,
              isVerified: true,
            },
          },
          processedBy: {
            select: {
              id: true,
              nickname: true,
            },
          },
        },
      }),
      this.prisma.verificationRequest.count({ where }),
    ]);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * 인증 요청 상세 조회
   */
  async getVerification(id: string) {
    const verification = await this.prisma.verificationRequest.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            nickname: true,
            isVerified: true,
            jobType: true,
            career: true,
            createdAt: true,
          },
        },
        processedBy: {
          select: {
            id: true,
            nickname: true,
            email: true,
          },
        },
      },
    });

    if (!verification) {
      throw new NotFoundException('인증 요청을 찾을 수 없습니다');
    }

    return verification;
  }

  /**
   * 인증 요청 처리 (승인/반려)
   */
  async processVerification(
    id: string,
    adminId: string,
    dto: ProcessVerificationDto,
  ) {
    const verification = await this.prisma.verificationRequest.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!verification) {
      throw new NotFoundException('인증 요청을 찾을 수 없습니다');
    }

    if (verification.status !== VerificationStatus.PENDING) {
      throw new BadRequestException('이미 처리된 인증 요청입니다');
    }

    // 반려 시 사유 필수
    if (dto.status === VerificationStatus.REJECTED && !dto.rejectionReason) {
      throw new BadRequestException('반려 사유를 입력해주세요');
    }

    // 트랜잭션으로 처리
    const result = await this.prisma.$transaction(async (tx) => {
      // 인증 요청 상태 업데이트
      const updated = await tx.verificationRequest.update({
        where: { id },
        data: {
          status: dto.status,
          processedById: adminId,
          processedAt: new Date(),
          rejectionReason: dto.rejectionReason,
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              nickname: true,
              isVerified: true,
            },
          },
          processedBy: {
            select: {
              id: true,
              nickname: true,
            },
          },
        },
      });

      // 승인 시 사용자 isVerified 업데이트
      if (dto.status === VerificationStatus.APPROVED) {
        await tx.user.update({
          where: { id: verification.userId },
          data: { isVerified: true },
        });
      }

      return updated;
    });

    // 알림 전송
    const notificationType =
      dto.status === VerificationStatus.APPROVED
        ? NotificationType.VERIFICATION_APPROVED
        : NotificationType.VERIFICATION_REJECTED;

    await this.notificationsService.create({
      userId: verification.userId,
      actorId: adminId,
      type: notificationType,
    });

    return result;
  }

  /**
   * 인증 파일 접근 로그 기록
   */
  async logVerificationAccess(
    verificationRequestId: string,
    adminId: string,
    action: 'VIEW' | 'DOWNLOAD',
    ipAddress?: string,
    userAgent?: string,
  ) {
    await this.prisma.verificationAccessLog.create({
      data: {
        verificationRequestId,
        accessedById: adminId,
        action,
        ipAddress,
        userAgent,
      },
    });
  }

  /**
   * 인증 파일 접근 로그 조회
   */
  async getVerificationAccessLogs(verificationRequestId: string) {
    return this.prisma.verificationAccessLog.findMany({
      where: { verificationRequestId },
      include: {
        accessedBy: {
          select: { id: true, nickname: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
