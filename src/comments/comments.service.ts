import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { CommentResponseDto } from './dto/comment-response.dto';

@Injectable()
export class CommentsService {
  constructor(private readonly prisma: PrismaService) {}

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

    // 댓글 생성 + commentCount 증가
    const comment = await this.prisma.$transaction(async (tx) => {
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

    return new CommentResponseDto(comment);
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

      // 3. commentCount 감소 (본인 + 답글)
      await tx.post.update({
        where: { id: comment.postId },
        data: { commentCount: { decrement: 1 + replyCount } },
      });
    });
  }
}
