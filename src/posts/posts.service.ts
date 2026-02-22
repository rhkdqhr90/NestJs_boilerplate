import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UploadsService } from '../uploads/uploads.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { PaginationDto, PaginatedResponse } from './dto/pagination.dto';
import { PostResponseDto } from './dto/post-response.dto';
import { hashIp } from '../common/utils/ip.util';
import { viewTracker } from '../common/utils/view-tracker.util';
import { safeDecrementLikeCount } from '../common/utils/counter.util';

@Injectable()
export class PostsService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    @Inject(forwardRef(() => UploadsService))
    private uploadsService: UploadsService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {}

  // ========================================
  // 1. 게시글 작성
  // ========================================
  async create(userId: string, createPostDto: CreatePostDto, ip: string) {
    // 급여 범위 유효성 검증
    if (
      createPostDto.salaryMin !== undefined &&
      createPostDto.salaryMax !== undefined &&
      createPostDto.salaryMin > createPostDto.salaryMax
    ) {
      throw new BadRequestException('최소 급여는 최대 급여보다 클 수 없습니다');
    }

    // deadline 문자열을 Date 객체로 변환 (날짜만 있으면 자정 UTC로 변환)
    const deadline = createPostDto.deadline
      ? new Date(createPostDto.deadline)
      : undefined;

    const post = await this.prisma.post.create({
      data: {
        ...createPostDto,
        deadline,
        authorId: createPostDto.isAnonymous ? null : userId,
        // 익명 게시글: 실제 작성자 ID 저장 (삭제 권한용) + IP 해시 (보조 검증)
        anonymousAuthorId: createPostDto.isAnonymous ? userId : null,
        ipHash: createPostDto.isAnonymous ? hashIp(ip) : null,
      },
      include: {
        author: {
          select: {
            id: true,
            nickname: true,
            profileImage: true,
            jobType: true,
            career: true,
            isVerified: true,
          },
        },
      },
    });

    return new PostResponseDto(post);
  }

  // ========================================
  // 2. 게시글 목록 조회 (페이지네이션)
  // ========================================
  async findAll(
    pagination: PaginationDto,
  ): Promise<PaginatedResponse<PostResponseDto>> {
    const {
      page,
      limit,
      category,
      search,
      sort,
      order,
      jobSubCategory,
      region,
      isRecruiting,
    } = pagination;
    const skip = (page - 1) * limit;

    // ✅ SQL Injection 방지: 동적 필드 검증
    const allowedSortFields: Record<string, boolean> = {
      createdAt: true,
      viewCount: true,
      likeCount: true,
    };

    if (!allowedSortFields[sort]) {
      throw new BadRequestException('잘못된 정렬 필드입니다');
    }

    // Where 조건
    const where: any = {};
    if (category) {
      where.category = category;
    }
    if (search) {
      if (search.length > 100) {
        throw new BadRequestException('검색어가 너무 깁니다 (최대 100자)');
      }
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { content: { contains: search, mode: 'insensitive' } },
      ];
    }

    // 구인공고 필터
    if (jobSubCategory) {
      where.jobSubCategory = jobSubCategory;
    }
    if (region) {
      where.region = region;
    }
    if (isRecruiting !== undefined) {
      where.isRecruiting = isRecruiting;
    }

    // 치료/교육 분야 태그 필터 (선택된 태그 중 하나라도 포함된 경우)
    if (pagination.therapyTags && pagination.therapyTags.length > 0) {
      where.therapyTags = {
        hasSome: pagination.therapyTags,
      };
    }

    // 데이터 조회 + 총 개수
    const [posts, total] = await Promise.all([
      this.prisma.post.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sort]: order },
        include: {
          author: {
            select: {
              id: true,
              nickname: true,
              profileImage: true,
              jobType: true,
              career: true,
              isVerified: true,
            },
          },
        },
      }),
      this.prisma.post.count({ where }),
    ]);

    return {
      data: posts.map((post) => new PostResponseDto(post)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ========================================
  // 3. 게시글 상세 조회 (조회수 증가 - 중복 방지)
  // ========================================
  async findOne(id: string, ip: string) {
    const ipHash = hashIp(ip);

    // 게시글 존재 확인
    const existingPost = await this.prisma.post.findUnique({
      where: { id },
      include: {
        author: {
          select: {
            id: true,
            nickname: true,
            profileImage: true,
            jobType: true,
            career: true,
            isVerified: true,
          },
        },
      },
    });

    if (!existingPost) {
      throw new NotFoundException('게시글을 찾을 수 없습니다');
    }

    // 조회수 중복 방지: 10분 내 같은 IP는 조회수 증가 안함
    if (viewTracker.shouldIncrementView(id, ipHash)) {
      await this.prisma.post.update({
        where: { id },
        data: { viewCount: { increment: 1 } },
      });
      // 증가된 조회수 반영
      return new PostResponseDto({
        ...existingPost,
        viewCount: existingPost.viewCount + 1,
      });
    }

    return new PostResponseDto(existingPost);
  }

  // ========================================
  // 4. 게시글 수정 (작성자만)
  // ========================================
  async update(id: string, userId: string, updatePostDto: UpdatePostDto) {
    // 게시글 조회
    const post = await this.prisma.post.findUnique({
      where: { id },
    });

    if (!post) {
      throw new NotFoundException('게시글을 찾을 수 없습니다');
    }

    // 권한 확인 (작성자만)
    if (post.authorId !== userId) {
      throw new ForbiddenException('본인이 작성한 게시글만 수정할 수 있습니다');
    }

    // 익명 게시글은 수정 불가 (정책)
    if (post.isAnonymous) {
      throw new ForbiddenException('익명 게시글은 수정할 수 없습니다');
    }

    // 카테고리 변경 방지 (보안: 익명→일반 게시판 이동 방지)
    if (updatePostDto.category && updatePostDto.category !== post.category) {
      throw new BadRequestException('게시글의 카테고리는 변경할 수 없습니다');
    }

    // deadline 문자열을 Date 객체로 변환
    const deadline = updatePostDto.deadline
      ? new Date(updatePostDto.deadline)
      : undefined;

    // 업데이트
    const updatedPost = await this.prisma.post.update({
      where: { id },
      data: {
        ...updatePostDto,
        deadline,
      },
      include: {
        author: {
          select: {
            id: true,
            nickname: true,
            profileImage: true,
            jobType: true,
            career: true,
            isVerified: true,
          },
        },
      },
    });

    return new PostResponseDto(updatedPost);
  }

  // ========================================
  // 5. 게시글 삭제 (작성자만)
  // ========================================
  async remove(id: string, userId: string, ip: string) {
    // 게시글 조회
    const post = await this.prisma.post.findUnique({
      where: { id },
    });

    if (!post) {
      throw new NotFoundException('게시글을 찾을 수 없습니다');
    }

    // 권한 확인: 익명 게시글 vs 일반 게시글
    if (post.isAnonymous) {
      // 익명: 실제 작성자 ID로 검증 (보안 강화)
      // 기존 게시글(anonymousAuthorId 없음)은 IP 해시로 폴백
      if (post.anonymousAuthorId) {
        if (post.anonymousAuthorId !== userId) {
          throw new ForbiddenException(
            '본인이 작성한 게시글만 삭제할 수 있습니다',
          );
        }
      } else {
        // 레거시: IP 해시 비교 (기존 익명 게시글 호환)
        const currentIpHash = hashIp(ip);
        if (post.ipHash !== currentIpHash) {
          throw new ForbiddenException(
            '익명 게시글은 작성한 네트워크 환경에서만 삭제할 수 있습니다',
          );
        }
      }
    } else {
      // 일반: authorId 비교
      if (post.authorId !== userId) {
        throw new ForbiddenException(
          '본인이 작성한 게시글만 삭제할 수 있습니다',
        );
      }
    }

    // 게시글 내용에서 이미지 URL 추출 및 삭제
    await this.deletePostImages(post.content);

    // 삭제 (Cascade로 댓글, 좋아요도 삭제)
    await this.prisma.post.delete({
      where: { id },
    });
  }

  /**
   * 게시글 HTML 콘텐츠에서 이미지 URL 추출 후 삭제
   */
  private async deletePostImages(content: string): Promise<void> {
    try {
      // 정규식으로 /uploads/post/... 패턴 추출
      const imageUrlRegex = /\/uploads\/post\/[a-zA-Z0-9_\-.]+/g;
      const matches = content.match(imageUrlRegex);

      if (!matches || matches.length === 0) {
        return;
      }

      // 중복 제거
      const uniqueUrls = [...new Set(matches)];

      this.logger.log(
        `Deleting ${uniqueUrls.length} images from post`,
        'PostsService',
      );

      // 병렬로 이미지 삭제
      await Promise.all(
        uniqueUrls.map((url) => this.uploadsService.deleteFile(url)),
      );
    } catch (error) {
      // 이미지 삭제 실패는 로깅만 (게시글 삭제는 진행)
      this.logger.warn(
        `Failed to delete post images: ${error}`,
        'PostsService',
      );
    }
  }

  // ========================================
  // 6. 인기글 조회 (최근 24시간, 조회수+좋아요 기준)
  // ========================================
  async getHotPosts(limit: number = 5) {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const posts = await this.prisma.post.findMany({
      where: {
        createdAt: { gte: oneDayAgo },
      },
      orderBy: [{ likeCount: 'desc' }, { viewCount: 'desc' }],
      take: limit,
      include: {
        author: {
          select: {
            id: true,
            nickname: true,
            profileImage: true,
            jobType: true,
            career: true,
            isVerified: true,
          },
        },
      },
    });

    // 24시간 내 게시글이 없으면 전체 인기글 반환
    if (posts.length === 0) {
      const fallbackPosts = await this.prisma.post.findMany({
        orderBy: [{ likeCount: 'desc' }, { viewCount: 'desc' }],
        take: limit,
        include: {
          author: {
            select: {
              id: true,
              nickname: true,
              profileImage: true,
              jobType: true,
              career: true,
              isVerified: true,
            },
          },
        },
      });
      return fallbackPosts.map((post) => new PostResponseDto(post));
    }

    return posts.map((post) => new PostResponseDto(post));
  }

  // ========================================
  // 6-1. 카테고리별 프리뷰 조회 (홈 화면용 - 단일 API)
  // ========================================
  async getCategoryPreviews(categories: string[], limit: number = 3) {
    // 최대 15개 카테고리, 카테고리당 최대 5개 게시글
    const safeCategories = categories.slice(0, 15);
    const safeLimit = Math.min(Math.max(1, limit), 5);

    // 병렬로 모든 카테고리 조회
    const results = await Promise.all(
      safeCategories.map(async (category) => {
        const posts = await this.prisma.post.findMany({
          where: { category: category as any },
          orderBy: { createdAt: 'desc' },
          take: safeLimit,
          select: {
            id: true,
            title: true,
            category: true,
            viewCount: true,
            likeCount: true,
            commentCount: true,
            createdAt: true,
            isAnonymous: true,
            author: {
              select: {
                id: true,
                nickname: true,
                isVerified: true,
              },
            },
          },
        });

        return {
          category,
          posts,
        };
      }),
    );

    return results;
  }

  // ========================================
  // 7. 좋아요 토글 (Race Condition 방지)
  // ========================================
  async toggleLike(postId: string, userId: string) {
    // 인터랙티브 트랜잭션으로 Race Condition 방지
    return this.prisma.$transaction(async (tx) => {
      // 게시글 존재 확인 (트랜잭션 내에서)
      const post = await tx.post.findUnique({
        where: { id: postId },
      });

      if (!post) {
        throw new NotFoundException('게시글을 찾을 수 없습니다');
      }

      // 좋아요 확인 (트랜잭션 내에서)
      const existingLike = await tx.like.findUnique({
        where: {
          userId_postId: {
            userId,
            postId,
          },
        },
      });

      if (existingLike) {
        // 좋아요 취소
        await tx.like.delete({
          where: { id: existingLike.id },
        });

        // 안전 감소 (음수 방지)
        await safeDecrementLikeCount(tx, postId, 1);
        const updatedPost = await tx.post.findUnique({
          where: { id: postId },
          select: { likeCount: true },
        });

        return { liked: false, likeCount: updatedPost?.likeCount ?? 0 };
      } else {
        // 좋아요 추가
        await tx.like.create({
          data: {
            userId,
            postId,
          },
        });

        const updatedPost = await tx.post.update({
          where: { id: postId },
          data: { likeCount: { increment: 1 } },
        });

        // 좋아요 알림 생성 (비동기, 실패해도 좋아요는 성공)
        if (post.authorId) {
          this.notificationsService
            .create({
              type: NotificationType.LIKE,
              userId: post.authorId,
              actorId: userId,
              postId,
            })
            .catch((err) => {
              this.logger.error(
                'Failed to create like notification',
                err,
                'PostsService',
              );
            });
        }

        return { liked: true, likeCount: updatedPost.likeCount };
      }
    });
  }

  // ========================================
  // 8. 북마크 토글 (Race Condition 방지)
  // ========================================
  async toggleBookmark(postId: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      // 게시글 존재 확인
      const post = await tx.post.findUnique({
        where: { id: postId },
      });

      if (!post) {
        throw new NotFoundException('게시글을 찾을 수 없습니다');
      }

      // 북마크 확인
      const existingBookmark = await tx.bookmark.findUnique({
        where: {
          userId_postId: {
            userId,
            postId,
          },
        },
      });

      if (existingBookmark) {
        // 북마크 취소
        await tx.bookmark.delete({
          where: { id: existingBookmark.id },
        });

        return { bookmarked: false };
      } else {
        // 북마크 추가
        await tx.bookmark.create({
          data: {
            userId,
            postId,
          },
        });

        return { bookmarked: true };
      }
    });
  }

  // ========================================
  // 9. 북마크 상태 확인
  // ========================================
  async getBookmarkStatus(postId: string, userId: string) {
    const bookmark = await this.prisma.bookmark.findUnique({
      where: {
        userId_postId: {
          userId,
          postId,
        },
      },
    });

    return { bookmarked: !!bookmark };
  }

  // ========================================
  // 10. 좋아요 상태 확인
  // ========================================
  async getLikeStatus(postId: string, userId: string) {
    const like = await this.prisma.like.findUnique({
      where: {
        userId_postId: {
          userId,
          postId,
        },
      },
    });

    return { liked: !!like };
  }
}
