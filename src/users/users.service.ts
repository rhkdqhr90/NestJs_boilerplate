import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { safeDecrementCommentCount, safeDecrementLikeCount } from '../common/utils/counter.util';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  private readonly SALT_ROUNDS = 10;

  constructor(private prisma: PrismaService) {}

  // ========================================
  // 1. 유저 조회 (password 제외!)
  // ========================================
  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        nickname: true,
        role: true,
        provider: true,
        providerId: true,
        isVerified: true,
        jobType: true,
        career: true,
        profileImage: true,
        isExpert: true,
        expertType: true,
        expertVerifiedAt: true,
        lastLoginAt: true,
        isBanned: true,
        bannedAt: true,
        bannedUntil: true,
        banReason: true,
        termsAgreedAt: true,
        privacyAgreedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다');
    }

    return user;
  }

  // ========================================
  // 비밀번호 포함 조회 (내부 전용)
  // ========================================
  private async findOneWithPassword(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다');
    }

    return user;
  }

  // ========================================
  // 2. 프로필 수정
  // ========================================
  async update(id: string, updateUserDto: UpdateUserDto) {
    // 유저 존재 확인
    await this.findOne(id);

    // 이메일 변경 시 추가 검증
    if (updateUserDto.email) {
      // 1. 중복 확인
      const existingUser = await this.prisma.user.findUnique({
        where: { email: updateUserDto.email },
      });

      if (existingUser && existingUser.id !== id) {
        throw new ConflictException('이미 사용 중인 이메일입니다');
      }

      // 2. 현재 비밀번호 확인 (보안 강화)
      const userWithPassword = await this.findOneWithPassword(id);
      if (userWithPassword.password && updateUserDto.currentPassword) {
        const isPasswordValid = await bcrypt.compare(
          updateUserDto.currentPassword,
          userWithPassword.password,
        );
        if (!isPasswordValid) {
          throw new UnauthorizedException('현재 비밀번호가 올바르지 않습니다');
        }
      } else if (userWithPassword.password && !updateUserDto.currentPassword) {
        throw new UnauthorizedException(
          '이메일 변경 시 현재 비밀번호가 필요합니다',
        );
      }
      // OAuth 사용자는 비밀번호 없이 이메일 변경 가능 (이미 OAuth 인증됨)
    }

    // currentPassword는 DB에 저장하지 않음
    const { currentPassword: _, ...updateData } = updateUserDto;

    // 업데이트
    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: {
        ...updateData,
        // 이메일 변경 시 인증 해제
        ...(updateUserDto.email && { isVerified: false }),
      },
      select: {
        id: true,
        email: true,
        nickname: true,
        role: true,
        provider: true,
        providerId: true,
        isVerified: true,
        jobType: true,
        career: true,
        profileImage: true,
        isExpert: true,
        expertType: true,
        expertVerifiedAt: true,
        lastLoginAt: true,
        isBanned: true,
        bannedAt: true,
        bannedUntil: true,
        banReason: true,
        termsAgreedAt: true,
        privacyAgreedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return updatedUser;
  }

  // ========================================
  // 3. 비밀번호 변경 (RefreshToken 무효화!)
  // ========================================
  async changePassword(id: string, changePasswordDto: ChangePasswordDto) {
    // 유저 조회 (password 포함)
    const user = await this.findOneWithPassword(id);

    // OAuth 사용자 체크
    if (!user.password) {
      throw new UnauthorizedException(
        '소셜 로그인 계정은 비밀번호를 변경할 수 없습니다',
      );
    }

    // 현재 비밀번호 확인
    const isPasswordValid = await bcrypt.compare(
      changePasswordDto.currentPassword,
      user.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('현재 비밀번호가 올바르지 않습니다');
    }

    // 새 비밀번호 해싱
    const hashedPassword = await bcrypt.hash(
      changePasswordDto.newPassword,
      this.SALT_ROUNDS,
    );

    // Access Token 만료 시간 (15분 후)
    const accessTokenExpiry = new Date(Date.now() + 15 * 60 * 1000);

    // 트랜잭션: 비밀번호 변경 + RefreshToken 무효화 + Access Token 블랙리스트 추가
    await this.prisma.$transaction([
      // 1. 비밀번호 업데이트
      this.prisma.user.update({
        where: { id },
        data: { password: hashedPassword },
      }),
      // 2. 모든 RefreshToken 무효화 (보안!)
      this.prisma.refreshToken.updateMany({
        where: {
          userId: id,
          revokedAt: null, // 아직 유효한 토큰만
        },
        data: {
          revokedAt: new Date(),
        },
      }),
      // 3. Access Token 블랙리스트에 추가 (기존 토큰 즉시 무효화)
      this.prisma.tokenBlacklist.create({
        data: {
          userId: id,
          expiresAt: accessTokenExpiry,
          reason: 'password_change',
        },
      }),
    ]);
  }

  // ========================================
  // 4. 내가 쓴 글 조회
  // ========================================
  async getMyPosts(
    id: string,
    options: { page?: number; limit?: number } = {},
  ) {
    const { page = 1, limit = 20 } = options;
    const skip = (page - 1) * limit;

    const [posts, total] = await Promise.all([
      this.prisma.post.findMany({
        where: { authorId: id },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          author: {
            select: {
              id: true,
              nickname: true,
              jobType: true,
              career: true,
              isVerified: true,
            },
          },
          _count: {
            select: { comments: true, likes: true },
          },
        },
      }),
      this.prisma.post.count({ where: { authorId: id } }),
    ]);

    return {
      data: posts.map((post) => ({
        ...post,
        likeCount: post._count.likes,
        commentCount: post._count.comments,
        _count: undefined,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ========================================
  // 5. 내가 쓴 댓글 조회
  // ========================================
  async getMyComments(
    id: string,
    options: { page?: number; limit?: number } = {},
  ) {
    const { page = 1, limit = 20 } = options;
    const skip = (page - 1) * limit;

    const [comments, total] = await Promise.all([
      this.prisma.comment.findMany({
        where: { authorId: id },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          post: {
            select: {
              id: true,
              title: true,
              category: true,
            },
          },
        },
      }),
      this.prisma.comment.count({ where: { authorId: id } }),
    ]);

    return {
      data: comments,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ========================================
  // 6. 내 북마크 조회
  // ========================================
  async getMyBookmarks(
    id: string,
    options: { page?: number; limit?: number } = {},
  ) {
    const { page = 1, limit = 20 } = options;
    const skip = (page - 1) * limit;

    const [bookmarks, total] = await Promise.all([
      this.prisma.bookmark.findMany({
        where: { userId: id },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          post: {
            include: {
              author: {
                select: {
                  id: true,
                  nickname: true,
                  jobType: true,
                  career: true,
                  isVerified: true,
                },
              },
              _count: {
                select: { comments: true, likes: true },
              },
            },
          },
        },
      }),
      this.prisma.bookmark.count({ where: { userId: id } }),
    ]);

    return {
      data: bookmarks.map((bookmark) => ({
        id: bookmark.post.id,
        title: bookmark.post.title,
        content: bookmark.post.content,
        category: bookmark.post.category,
        isAnonymous: bookmark.post.isAnonymous,
        viewCount: bookmark.post.viewCount,
        likeCount: bookmark.post._count.likes,
        commentCount: bookmark.post._count.comments,
        createdAt: bookmark.post.createdAt,
        author: bookmark.post.author,
        bookmarkedAt: bookmark.createdAt,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ========================================
  // 7. 내가 좋아요한 글 조회
  // ========================================
  async getMyLikes(
    id: string,
    options: { page?: number; limit?: number } = {},
  ) {
    const { page = 1, limit = 20 } = options;
    const skip = (page - 1) * limit;

    const [likes, total] = await Promise.all([
      this.prisma.like.findMany({
        where: { userId: id },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          post: {
            include: {
              author: {
                select: {
                  id: true,
                  nickname: true,
                  jobType: true,
                  career: true,
                  isVerified: true,
                },
              },
              _count: {
                select: { comments: true, likes: true },
              },
            },
          },
        },
      }),
      this.prisma.like.count({ where: { userId: id } }),
    ]);

    return {
      data: likes.map((like) => ({
        id: like.post.id,
        title: like.post.title,
        content: like.post.content,
        category: like.post.category,
        isAnonymous: like.post.isAnonymous,
        viewCount: like.post.viewCount,
        likeCount: like.post._count.likes,
        commentCount: like.post._count.comments,
        createdAt: like.post.createdAt,
        author: like.post.author,
        likedAt: like.createdAt,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ========================================
  // 8. 사용자 검색 (멘션용)
  // ========================================
  async searchUsers(query: string, limit = 10) {
    if (!query || query.length < 1) {
      return [];
    }

    // limit 최대값 제한 (DoS 방지)
    const safeLimit = Math.min(Math.max(1, limit), 20);

    const users = await this.prisma.user.findMany({
      where: {
        nickname: {
          contains: query,
          mode: 'insensitive',
        },
      },
      select: {
        id: true,
        nickname: true,
        isVerified: true,
        jobType: true,
      },
      take: safeLimit,
      orderBy: {
        nickname: 'asc',
      },
    });

    return users;
  }

  // ========================================
  // 8. 대시보드 통계
  // ========================================
  async getDashboardStats(userId: string) {
    const [postCount, commentCount, likeCount, bookmarkCount] =
      await Promise.all([
        this.prisma.post.count({ where: { authorId: userId } }),
        this.prisma.comment.count({ where: { authorId: userId } }),
        this.prisma.like.count({
          where: {
            post: { authorId: userId },
          },
        }),
        this.prisma.bookmark.count({ where: { userId } }),
      ]);

    return {
      postCount,
      commentCount,
      receivedLikeCount: likeCount,
      bookmarkCount,
    };
  }

  // ========================================
  // 9. 최근 활동
  // ========================================
  async getRecentActivity(userId: string, limit = 5) {
    const [recentPosts, recentComments] = await Promise.all([
      this.prisma.post.findMany({
        where: { authorId: userId },
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          category: true,
          createdAt: true,
          _count: {
            select: { comments: true, likes: true },
          },
        },
      }),
      this.prisma.comment.findMany({
        where: { authorId: userId },
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          content: true,
          createdAt: true,
          post: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      }),
    ]);

    return {
      recentPosts: recentPosts.map((post) => ({
        ...post,
        likeCount: post._count.likes,
        commentCount: post._count.comments,
        _count: undefined,
      })),
      recentComments,
    };
  }

  // ========================================
  // 10. 회원 탈퇴 (비밀번호 확인!)
  // ========================================
  async remove(id: string, password: string) {
    // 유저 조회 (password 포함)
    const user = await this.findOneWithPassword(id);

    // Local 사용자는 비밀번호 확인
    if (user.password) {
      const isPasswordValid = await bcrypt.compare(password, user.password);

      if (!isPasswordValid) {
        throw new UnauthorizedException('비밀번호가 올바르지 않습니다');
      }
    }

    // 비정규화 카운트 조정 후 삭제 (Cascade로 연관 데이터도 삭제됨)
    await this.prisma.$transaction(async (tx) => {
      // 1. 사용자의 댓글이 속한 게시글들의 commentCount 조정
      const userComments = await tx.comment.findMany({
        where: { authorId: id },
        select: { id: true, postId: true, parentCommentId: true },
      });

      // 게시글별 댓글 수 집계
      const commentCountByPost = new Map<string, number>();
      for (const comment of userComments) {
        const current = commentCountByPost.get(comment.postId) || 0;
        commentCountByPost.set(comment.postId, current + 1);
      }

      // commentCount 안전 차감 (음수 방지)
      for (const [postId, count] of commentCountByPost) {
        await safeDecrementCommentCount(tx, postId, count).catch(() => {
          // 게시글이 이미 삭제된 경우 무시
        });
      }

      // 2. 사용자의 좋아요가 속한 게시글들의 likeCount 조정
      const userLikes = await tx.like.findMany({
        where: { userId: id },
        select: { postId: true },
      });

      const likeCountByPost = new Map<string, number>();
      for (const like of userLikes) {
        const current = likeCountByPost.get(like.postId) || 0;
        likeCountByPost.set(like.postId, current + 1);
      }

      // likeCount 안전 차감 (음수 방지)
      for (const [postId, count] of likeCountByPost) {
        await safeDecrementLikeCount(tx, postId, count).catch(() => {
          // 게시글이 이미 삭제된 경우 무시
        });
      }

      // 3. 사용자 삭제 (Cascade로 연관 데이터도 삭제됨)
      await tx.user.delete({
        where: { id },
      });
    });
  }
}
