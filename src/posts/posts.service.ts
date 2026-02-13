import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { PaginationDto, PaginatedResponse } from './dto/pagination.dto';
import { PostResponseDto } from './dto/post-response.dto';
import { hashIp } from '../common/utils/ip.util';

@Injectable()
export class PostsService {
  constructor(private prisma: PrismaService) {}

  // ========================================
  // 1. 게시글 작성
  // ========================================
  async create(userId: string, createPostDto: CreatePostDto, ip: string) {
    const post = await this.prisma.post.create({
      data: {
        ...createPostDto,
        authorId: createPostDto.isAnonymous ? null : userId,
        ipHash: createPostDto.isAnonymous ? hashIp(ip) : null, // ✅ IP 해싱
      },
      include: {
        author: {
          select: {
            id: true,
            nickname: true,
            profileImage: true,
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
    const { page, limit, category, search, sort, order } = pagination;
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
  // 3. 게시글 상세 조회 (조회수 증가)
  // ========================================
  async findOne(id: string) {
    const existingPost = await this.prisma.post.findUnique({
      where: { id },
    });

    if (!existingPost) {
      throw new NotFoundException(`게시글을 찾을 수 없습니다 (ID: ${id})`);
    }

    // 조회수 증가 + 조회
    const post = await this.prisma.post.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
      include: {
        author: {
          select: {
            id: true,
            nickname: true,
            profileImage: true,
          },
        },
      },
    });

    return new PostResponseDto(post);
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
      throw new NotFoundException(`게시글을 찾을 수 없습니다 (ID: ${id})`);
    }

    // 권한 확인 (작성자만)
    if (post.authorId !== userId) {
      throw new ForbiddenException('본인이 작성한 게시글만 수정할 수 있습니다');
    }

    // 익명 게시글은 수정 불가 (정책)
    if (post.isAnonymous) {
      throw new ForbiddenException('익명 게시글은 수정할 수 없습니다');
    }

    // 업데이트
    const updatedPost = await this.prisma.post.update({
      where: { id },
      data: updatePostDto,
      include: {
        author: {
          select: {
            id: true,
            nickname: true,
            profileImage: true,
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
      throw new NotFoundException(`게시글을 찾을 수 없습니다 (ID: ${id})`);
    }

    // 권한 확인: 익명 게시글 vs 일반 게시글
    if (post.isAnonymous) {
      // 익명: IP 해시 비교
      const currentIpHash = hashIp(ip);
      if (post.ipHash !== currentIpHash) {
        throw new ForbiddenException(
          '익명 게시글은 작성한 네트워크 환경에서만 삭제할 수 있습니다',
        );
      }
    } else {
      // 일반: authorId 비교
      if (post.authorId !== userId) {
        throw new ForbiddenException(
          '본인이 작성한 게시글만 삭제할 수 있습니다',
        );
      }
    }

    // 삭제 (Cascade로 댓글, 좋아요도 삭제)
    await this.prisma.post.delete({
      where: { id },
    });
  }

  // ========================================
  // 6. 좋아요 토글
  // ========================================
  async toggleLike(postId: string, userId: string) {
    // 게시글 존재 확인
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
    });

    if (!post) {
      throw new NotFoundException(`게시글을 찾을 수 없습니다 (ID: ${postId})`);
    }

    // 좋아요 확인
    const existingLike = await this.prisma.like.findUnique({
      where: {
        userId_postId: {
          userId,
          postId,
        },
      },
    });

    if (existingLike) {
      // 좋아요 취소
      await this.prisma.$transaction([
        this.prisma.like.delete({
          where: { id: existingLike.id },
        }),
        this.prisma.post.update({
          where: { id: postId },
          data: { likeCount: { decrement: 1 } },
        }),
      ]);

      return { liked: false, likeCount: post.likeCount - 1 };
    } else {
      // 좋아요 추가
      await this.prisma.$transaction([
        this.prisma.like.create({
          data: {
            userId,
            postId,
          },
        }),
        this.prisma.post.update({
          where: { id: postId },
          data: { likeCount: { increment: 1 } },
        }),
      ]);

      return { liked: true, likeCount: post.likeCount + 1 };
    }
  }
}
