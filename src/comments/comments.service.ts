import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { NotificationType, PostCategory } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { CommentResponseDto } from './dto/comment-response.dto';
import { safeDecrementCommentCount } from '../common/utils/counter.util';

@Injectable()
export class CommentsService {
  // 스팸 방지 설정
  private readonly MAX_COMMENTS_PER_POST = 100; // 게시글당 최대 댓글 수
  private readonly MAX_COMMENTS_PER_USER_PER_MINUTE = 5; // 사용자당 분당 최대 댓글 수

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {}

  // ========================================
  // 1. 댓글 작성
  // ========================================
  async create(
    postId: string,
    userId: string,
    createCommentDto: CreateCommentDto,
  ) {
    const { parentCommentId, mentionedUserId, content } = createCommentDto;

    // 게시글 존재 확인
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) {
      throw new NotFoundException('게시글을 찾을 수 없습니다');
    }

    // 구인공고, 법률 Q&A는 댓글 불가
    if (
      post.category === PostCategory.JOB_POSTING ||
      post.category === PostCategory.LEGAL_QNA
    ) {
      throw new BadRequestException('이 게시판에서는 댓글을 작성할 수 없습니다');
    }

    // 스팸 방지: 사용자당 분당 댓글 수 확인 (트랜잭션 밖에서 사전 체크 - 정확한 체크는 아래 트랜잭션에서)
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    const recentCommentCount = await this.prisma.comment.count({
      where: {
        authorId: userId,
        createdAt: { gte: oneMinuteAgo },
      },
    });

    if (recentCommentCount >= this.MAX_COMMENTS_PER_USER_PER_MINUTE) {
      throw new BadRequestException(
        '댓글을 너무 자주 작성하고 있습니다. 잠시 후 다시 시도해주세요.',
      );
    }

    // 부모 댓글 검증 (대댓글인 경우)
    if (parentCommentId) {
      const parentComment = await this.prisma.comment.findUnique({
        where: { id: parentCommentId },
      });

      if (!parentComment) {
        throw new NotFoundException('부모 댓글을 찾을 수 없습니다');
      }

      // ✅ 1 depth만 허용 (대댓글의 대댓글 금지)
      if (parentComment.parentCommentId) {
        throw new BadRequestException('대댓글에는 답글을 작성할 수 없습니다');
      }

      // 부모 댓글이 같은 게시글에 속하는지 확인
      if (parentComment.postId !== postId) {
        throw new BadRequestException(
          '부모 댓글이 해당 게시글에 속하지 않습니다',
        );
      }
    }

    // 멘션된 유저 존재 확인
    if (mentionedUserId) {
      const mentionedUser = await this.prisma.user.findUnique({
        where: { id: mentionedUserId },
      });
      if (!mentionedUser) {
        throw new NotFoundException('멘션된 사용자를 찾을 수 없습니다');
      }
    }

    // 댓글 생성 + commentCount 증가 (트랜잭션 내에서 스팸 체크 포함)
    const comment = await this.prisma.$transaction(async (tx) => {
      // 스팸 방지: 게시글당 최대 댓글 수 확인 (트랜잭션 내에서 정확한 체크)
      const currentPost = await tx.post.findUnique({
        where: { id: postId },
        select: { commentCount: true },
      });
      if (currentPost && currentPost.commentCount >= this.MAX_COMMENTS_PER_POST) {
        throw new BadRequestException(
          `이 게시글에는 더 이상 댓글을 작성할 수 없습니다 (최대 ${this.MAX_COMMENTS_PER_POST}개)`,
        );
      }

      // 1. 댓글 생성
      const newComment = await tx.comment.create({
        data: {
          content,
          postId,
          authorId: userId,
          parentCommentId,
          mentionedUserId,
        },
        include: {
          author: {
            select: {
              id: true,
              nickname: true,
              profileImage: true,
            },
          },
          mentionedUser: {
            select: {
              id: true,
              nickname: true,
            },
          },
        },
      });

      // 2. commentCount 증가
      await tx.post.update({
        where: { id: postId },
        data: { commentCount: { increment: 1 } },
      });

      return newComment;
    });

    // 알림 생성 (비동기, 실패해도 댓글 작성은 성공)
    this.createNotifications(post, comment, parentCommentId, mentionedUserId, userId).catch((err) => {
      this.logger.error('Failed to create notification', err, 'CommentsService');
    });

    return new CommentResponseDto(comment);
  }

  /**
   * 댓글 관련 알림 생성
   */
  private async createNotifications(
    post: { id: string; authorId: string | null },
    comment: { id: string },
    parentCommentId: string | undefined,
    mentionedUserId: string | undefined,
    actorId: string,
  ) {
    // 1. 대댓글인 경우 → 부모 댓글 작성자에게 REPLY 알림
    if (parentCommentId) {
      const parentComment = await this.prisma.comment.findUnique({
        where: { id: parentCommentId },
        select: { authorId: true },
      });

      // 자기 자신에게 알림 보내지 않음
      if (parentComment?.authorId && parentComment.authorId !== actorId) {
        await this.notificationsService.create({
          type: NotificationType.REPLY,
          userId: parentComment.authorId,
          actorId,
          postId: post.id,
          commentId: comment.id,
        });
      }
    }
    // 2. 일반 댓글인 경우 → 게시글 작성자에게 COMMENT 알림
    // 자기 자신에게 알림 보내지 않음
    else if (post.authorId && post.authorId !== actorId) {
      await this.notificationsService.create({
        type: NotificationType.COMMENT,
        userId: post.authorId,
        actorId,
        postId: post.id,
        commentId: comment.id,
      });
    }

    // 3. 멘션된 경우 → 멘션된 사용자에게 MENTION 알림
    // 자기 자신에게 알림 보내지 않음
    if (mentionedUserId && mentionedUserId !== actorId) {
      await this.notificationsService.create({
        type: NotificationType.MENTION,
        userId: mentionedUserId,
        actorId,
        postId: post.id,
        commentId: comment.id,
      });
    }
  }

  // ========================================
  // 2. 게시글의 댓글 조회 (1 depth)
  // ========================================
  async findAllByPost(postId: string, page: number = 1, limit: number = 50) {
    // 게시글 존재 확인
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) {
      throw new NotFoundException('게시글을 찾을 수 없습니다');
    }

    const maxLimit = 100;
    const safeLimit = Math.min(limit, maxLimit);
    const skip = (page - 1) * safeLimit;

    const [comments, total] = await Promise.all([
      this.prisma.comment.findMany({
        where: {
          postId,
          parentCommentId: null, // 부모 댓글만
        },
        skip,
        take: safeLimit,
        include: {
          author: {
            select: {
              id: true,
              nickname: true,
              profileImage: true,
            },
          },
          mentionedUser: {
            select: {
              id: true,
              nickname: true,
            },
          },
          replies: {
            include: {
              author: {
                select: {
                  id: true,
                  nickname: true,
                  profileImage: true,
                },
              },
              mentionedUser: {
                select: {
                  id: true,
                  nickname: true,
                },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.comment.count({
        where: { postId, parentCommentId: null },
      }),
    ]);

    return {
      data: comments.map((comment) => new CommentResponseDto(comment)),
      meta: {
        page,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }

  // ========================================
  // 3. 댓글 수정 (작성자만)
  // ========================================
  async update(id: string, userId: string, updateCommentDto: UpdateCommentDto) {
    // 댓글 존재 확인
    const comment = await this.prisma.comment.findUnique({ where: { id } });
    if (!comment) {
      throw new NotFoundException('댓글을 찾을 수 없습니다');
    }

    // 작성자 확인
    if (comment.authorId !== userId) {
      throw new ForbiddenException('본인의 댓글만 수정할 수 있습니다');
    }

    // 수정
    const updatedComment = await this.prisma.comment.update({
      where: { id },
      data: updateCommentDto,
      include: {
        author: {
          select: {
            id: true,
            nickname: true,
            profileImage: true,
          },
        },
        mentionedUser: {
          select: {
            id: true,
            nickname: true,
          },
        },
      },
    });

    return new CommentResponseDto(updatedComment);
  }

  // ========================================
  // 4. 댓글 삭제 (작성자만)
  // ========================================
  async remove(id: string, userId: string) {
    // 댓글 존재 확인
    const comment = await this.prisma.comment.findUnique({ where: { id } });
    if (!comment) {
      throw new NotFoundException('댓글을 찾을 수 없습니다');
    }

    // 작성자 확인
    if (comment.authorId !== userId) {
      throw new ForbiddenException('본인의 댓글만 삭제할 수 있습니다');
    }

    // 삭제 + commentCount 감소
    await this.prisma.$transaction(async (tx) => {
      // 1. 댓글 삭제 (Cascade로 답글도 자동 삭제)
      const replyCount = await tx.comment.count({
        where: { parentCommentId: id },
      });

      // 2. 댓글 삭제 (Cascade로 답글도 자동 삭제)
      await tx.comment.delete({ where: { id } });

      // 3. commentCount 안전 감소 (본인 + 답글, 음수 방지)
      await safeDecrementCommentCount(tx, comment.postId, 1 + replyCount);
    });
  }
}
