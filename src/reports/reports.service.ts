import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateReportDto } from './dto/create-report.dto';
import { UpdateReportDto } from './dto/update-report.dto';
import { ReportType, ReportStatus, ReportAction } from '@prisma/client';
import { safeDecrementCommentCount } from '../common/utils/counter.util';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  /**
   * 신고 생성
   */
  async create(reporterId: string, dto: CreateReportDto) {
    // 자기 자신 신고 방지 (USER 타입)
    if (dto.type === ReportType.USER && dto.targetUserId === reporterId) {
      throw new BadRequestException('자기 자신을 신고할 수 없습니다');
    }

    // 신고 대상 유효성 검증 + 자기 게시글/댓글 신고 방지
    await this.validateReportTarget(dto, reporterId);

    // 중복 신고 방지 (같은 신고자가 같은 대상에 대해 PENDING 상태의 신고가 있는지)
    const existingReport = await this.prisma.report.findFirst({
      where: {
        reporterId,
        targetUserId: dto.targetUserId,
        targetPostId: dto.targetPostId,
        targetCommentId: dto.targetCommentId,
        status: ReportStatus.PENDING,
      },
    });

    if (existingReport) {
      throw new ConflictException('이미 신고 접수된 대상입니다');
    }

    return this.prisma.report.create({
      data: {
        type: dto.type,
        reason: dto.reason,
        reporterId,
        targetUserId: dto.targetUserId,
        targetPostId: dto.targetPostId,
        targetCommentId: dto.targetCommentId,
      },
      include: {
        reporter: {
          select: { id: true, nickname: true },
        },
      },
    });
  }

  /**
   * 신고 대상 유효성 검증 + 자기 게시글/댓글 신고 방지
   */
  private async validateReportTarget(dto: CreateReportDto, reporterId: string) {
    switch (dto.type) {
      case ReportType.USER:
        if (!dto.targetUserId) {
          throw new BadRequestException('신고할 사용자를 선택해주세요');
        }
        const user = await this.prisma.user.findUnique({
          where: { id: dto.targetUserId },
        });
        if (!user) {
          throw new NotFoundException('신고할 사용자를 찾을 수 없습니다');
        }
        break;

      case ReportType.POST:
        if (!dto.targetPostId) {
          throw new BadRequestException('신고할 게시글을 선택해주세요');
        }
        const post = await this.prisma.post.findUnique({
          where: { id: dto.targetPostId },
        });
        if (!post) {
          throw new NotFoundException('신고할 게시글을 찾을 수 없습니다');
        }
        // 자기 게시글 신고 방지
        if (post.authorId === reporterId) {
          throw new BadRequestException('자신의 게시글은 신고할 수 없습니다');
        }
        break;

      case ReportType.COMMENT:
        if (!dto.targetCommentId) {
          throw new BadRequestException('신고할 댓글을 선택해주세요');
        }
        const comment = await this.prisma.comment.findUnique({
          where: { id: dto.targetCommentId },
        });
        if (!comment) {
          throw new NotFoundException('신고할 댓글을 찾을 수 없습니다');
        }
        // 자기 댓글 신고 방지
        if (comment.authorId === reporterId) {
          throw new BadRequestException('자신의 댓글은 신고할 수 없습니다');
        }
        break;
    }
  }

  /**
   * 내 신고 목록 조회
   */
  async findMyReports(userId: string, page = 1, limit = 10) {
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.report.findMany({
        where: { reporterId: userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          targetUser: { select: { id: true, nickname: true } },
          targetPost: { select: { id: true, title: true } },
          targetComment: { select: { id: true, content: true } },
        },
      }),
      this.prisma.report.count({ where: { reporterId: userId } }),
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
   * 신고 목록 조회 (관리자)
   */
  async findAll(
    page = 1,
    limit = 20,
    status?: ReportStatus,
    type?: ReportType,
  ) {
    const skip = (page - 1) * limit;
    const where = {
      ...(status && { status }),
      ...(type && { type }),
    };

    const [data, total] = await Promise.all([
      this.prisma.report.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          reporter: { select: { id: true, nickname: true, email: true } },
          targetUser: { select: { id: true, nickname: true, email: true } },
          targetPost: { select: { id: true, title: true, authorId: true } },
          targetComment: { select: { id: true, content: true, authorId: true, postId: true } },
          processedBy: { select: { id: true, nickname: true } },
        },
      }),
      this.prisma.report.count({ where }),
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
   * 신고 상세 조회 (관리자)
   */
  async findOne(id: string) {
    const report = await this.prisma.report.findUnique({
      where: { id },
      include: {
        reporter: { select: { id: true, nickname: true, email: true } },
        targetUser: { select: { id: true, nickname: true, email: true } },
        targetPost: {
          select: {
            id: true,
            title: true,
            content: true,
            authorId: true,
            author: { select: { id: true, nickname: true } },
          },
        },
        targetComment: {
          select: {
            id: true,
            content: true,
            authorId: true,
            author: { select: { id: true, nickname: true } },
          },
        },
        processedBy: { select: { id: true, nickname: true } },
      },
    });

    if (!report) {
      throw new NotFoundException('신고를 찾을 수 없습니다');
    }

    return report;
  }

  /**
   * 신고 처리 (관리자)
   */
  async process(id: string, adminId: string, dto: UpdateReportDto) {
    const report = await this.prisma.report.findUnique({
      where: { id },
      include: {
        targetPost: { select: { id: true, authorId: true } },
        targetComment: { select: { id: true, authorId: true } },
        targetUser: { select: { id: true } },
      },
    });

    if (!report) {
      throw new NotFoundException('신고를 찾을 수 없습니다');
    }

    // 이미 처리된 신고인지 확인
    if (report.status !== ReportStatus.PENDING) {
      throw new BadRequestException('이미 처리된 신고입니다');
    }

    // 조치와 신고 타입 일치 여부 검증
    if (dto.action && dto.action !== ReportAction.NONE) {
      this.validateActionForReportType(report.type, dto.action);
      await this.executeAction(report, dto.action);
    }

    return this.prisma.report.update({
      where: { id },
      data: {
        status: dto.status,
        processingNote: dto.processingNote,
        processedById: adminId,
        processedAt: new Date(),
        action: dto.action || ReportAction.NONE,
      },
      include: {
        reporter: { select: { id: true, nickname: true } },
        processedBy: { select: { id: true, nickname: true } },
      },
    });
  }

  /**
   * 조치와 신고 타입 일치 여부 검증
   * 보안: 잘못된 조치 실행 방지
   */
  private validateActionForReportType(type: ReportType, action: ReportAction) {
    // 게시글 삭제는 POST 타입에서만
    if (action === ReportAction.POST_DELETE && type !== ReportType.POST) {
      throw new BadRequestException('게시글 삭제는 게시글 신고에서만 가능합니다');
    }

    // 댓글 삭제는 COMMENT 타입에서만
    if (action === ReportAction.COMMENT_DELETE && type !== ReportType.COMMENT) {
      throw new BadRequestException('댓글 삭제는 댓글 신고에서만 가능합니다');
    }

    // 사용자 정지는 모든 타입에서 가능 (게시글/댓글 작성자 또는 사용자 직접 신고)
  }

  /**
   * 신고 조치 실행
   */
  private async executeAction(
    report: {
      id: string;
      reason: string;
      targetPost?: { id: string; authorId: string | null } | null;
      targetComment?: { id: string; authorId: string } | null;
      targetUser?: { id: string } | null;
    },
    action: ReportAction,
  ) {
    switch (action) {
      case ReportAction.POST_DELETE:
        if (report.targetPost) {
          // 게시글 이미지 정리 후 삭제
          const postToDelete = await this.prisma.post.findUnique({
            where: { id: report.targetPost.id },
            select: { content: true },
          });
          if (postToDelete) {
            await this.deletePostImages(postToDelete.content);
          }
          await this.prisma.post.delete({
            where: { id: report.targetPost.id },
          });
        }
        break;

      case ReportAction.COMMENT_DELETE:
        if (report.targetComment) {
          // 댓글 삭제 + commentCount 차감 (대댓글 포함)
          const commentToDelete = await this.prisma.comment.findUnique({
            where: { id: report.targetComment.id },
            select: { postId: true },
          });
          if (commentToDelete) {
            await this.prisma.$transaction(async (tx) => {
              const replyCount = await tx.comment.count({
                where: { parentCommentId: report.targetComment!.id },
              });
              await tx.comment.delete({
                where: { id: report.targetComment!.id },
              });
              // 안전 차감 (음수 방지)
              await safeDecrementCommentCount(tx, commentToDelete.postId, 1 + replyCount);
            });
          }
        }
        break;

      case ReportAction.WARNING:
        // 경고는 별도 조치 없이 기록만 남김
        break;

      case ReportAction.USER_BAN_1DAY:
      case ReportAction.USER_BAN_7DAYS:
      case ReportAction.USER_BAN_30DAYS:
      case ReportAction.USER_BAN_PERMANENT:
        await this.banUser(report, action);
        break;
    }
  }

  /**
   * 사용자 정지 처리
   * 트랜잭션으로 감싸서 Race Condition 방지
   */
  private async banUser(
    report: {
      reason: string;
      targetPost?: { id: string; authorId: string | null } | null;
      targetComment?: { id: string; authorId: string } | null;
      targetUser?: { id: string } | null;
    },
    action: ReportAction,
  ) {
    // 정지할 사용자 ID 결정
    let targetUserId: string | null = null;

    if (report.targetUser) {
      targetUserId = report.targetUser.id;
    } else if (report.targetPost) {
      targetUserId = report.targetPost.authorId;
    } else if (report.targetComment) {
      targetUserId = report.targetComment.authorId;
    }

    if (!targetUserId) return;

    // 정지 기간 계산
    let bannedUntil: Date | null = null;
    const now = new Date();

    switch (action) {
      case ReportAction.USER_BAN_1DAY:
        bannedUntil = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);
        break;
      case ReportAction.USER_BAN_7DAYS:
        bannedUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        break;
      case ReportAction.USER_BAN_30DAYS:
        bannedUntil = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        break;
      case ReportAction.USER_BAN_PERMANENT:
        bannedUntil = null; // null이면 영구 정지
        break;
    }

    // Access Token 만료 시간 (15분 후)
    const accessTokenExpiry = new Date(Date.now() + 15 * 60 * 1000);

    // 트랜잭션으로 사용자 정지 + 토큰 삭제 + 블랙리스트를 원자적으로 처리
    // Race Condition 방지: 정지 처리 중 새 세션 생성 불가
    await this.prisma.$transaction(async (tx) => {
      // 1. 사용자 정지 처리
      await tx.user.update({
        where: { id: targetUserId! },
        data: {
          isBanned: true,
          bannedAt: now,
          bannedUntil,
          banReason: report.reason,
        },
      });

      // 2. 모든 리프레시 토큰 삭제 (강제 로그아웃)
      await tx.refreshToken.deleteMany({
        where: { userId: targetUserId! },
      });

      // 3. Access Token 블랙리스트에 추가 (기존 토큰 즉시 무효화)
      await tx.tokenBlacklist.create({
        data: {
          userId: targetUserId!,
          expiresAt: accessTokenExpiry,
          reason: 'user_ban',
        },
      });
    });
  }

  /**
   * 대기 중인 신고 수 조회 (관리자 대시보드용)
   */
  async getPendingCount() {
    return this.prisma.report.count({
      where: { status: ReportStatus.PENDING },
    });
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
      const fs = await import('fs');
      const path = await import('path');
      const uploadDir = path.join(process.cwd(), 'uploads');
      await Promise.all(
        uniqueUrls.map(async (url) => {
          const filePath = path.join(uploadDir, url.replace('/uploads/', ''));
          // Path traversal 방지: 결과 경로가 uploadDir 내부인지 검증
          const normalizedPath = path.resolve(filePath);
          if (!normalizedPath.startsWith(uploadDir + path.sep)) {
            return; // 경로 이탈 시 무시
          }
          try {
            await fs.promises.unlink(normalizedPath);
          } catch {
            // 파일 없으면 무시
          }
        }),
      );
    } catch {
      // 이미지 삭제 실패는 무시
    }
  }
}
