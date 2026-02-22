import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateAnswerDto } from './dto/create-answer.dto';
import { UpdateAnswerDto } from './dto/update-answer.dto';

@Injectable()
export class AnswersService {
  constructor(private prisma: PrismaService) {}

  // ========================================
  // 1. 답변 작성 (전문가만)
  // ========================================
  async create(postId: string, userId: string, createAnswerDto: CreateAnswerDto) {
    // 게시글 확인
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, category: true },
    });

    if (!post) {
      throw new NotFoundException('게시글을 찾을 수 없습니다');
    }

    // 법률 Q&A 카테고리만 답변 가능
    if (post.category !== 'LEGAL_QNA') {
      throw new BadRequestException('법률 Q&A 게시글에만 답변할 수 있습니다');
    }

    // 전문가 확인
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isExpert: true, expertType: true },
    });

    if (!user?.isExpert) {
      throw new ForbiddenException('인증된 전문가만 답변할 수 있습니다');
    }

    // 답변 생성
    const answer = await this.prisma.answer.create({
      data: {
        content: createAnswerDto.content,
        postId,
        authorId: userId,
      },
      include: {
        author: {
          select: {
            id: true,
            nickname: true,
            isExpert: true,
            expertType: true,
            profileImage: true,
          },
        },
      },
    });

    return answer;
  }

  // ========================================
  // 2. 게시글의 답변 목록 조회
  // ========================================
  async findByPostId(postId: string) {
    const answers = await this.prisma.answer.findMany({
      where: { postId },
      orderBy: [
        { isBest: 'desc' }, // 베스트 답변 먼저
        { createdAt: 'asc' }, // 그 다음 작성순
      ],
      include: {
        author: {
          select: {
            id: true,
            nickname: true,
            isExpert: true,
            expertType: true,
            profileImage: true,
          },
        },
      },
    });

    return answers;
  }

  // ========================================
  // 3. 답변 수정 (작성자만)
  // ========================================
  async update(answerId: string, userId: string, updateAnswerDto: UpdateAnswerDto) {
    const answer = await this.prisma.answer.findUnique({
      where: { id: answerId },
      select: { authorId: true },
    });

    if (!answer) {
      throw new NotFoundException('답변을 찾을 수 없습니다');
    }

    if (answer.authorId !== userId) {
      throw new ForbiddenException('본인의 답변만 수정할 수 있습니다');
    }

    return this.prisma.answer.update({
      where: { id: answerId },
      data: updateAnswerDto,
      include: {
        author: {
          select: {
            id: true,
            nickname: true,
            isExpert: true,
            expertType: true,
            profileImage: true,
          },
        },
      },
    });
  }

  // ========================================
  // 4. 답변 삭제 (작성자/관리자만)
  // ========================================
  async remove(answerId: string, userId: string, isAdmin = false) {
    const answer = await this.prisma.answer.findUnique({
      where: { id: answerId },
      select: { authorId: true },
    });

    if (!answer) {
      throw new NotFoundException('답변을 찾을 수 없습니다');
    }

    if (!isAdmin && answer.authorId !== userId) {
      throw new ForbiddenException('본인의 답변만 삭제할 수 있습니다');
    }

    await this.prisma.answer.delete({
      where: { id: answerId },
    });
  }

  // ========================================
  // 5. 베스트 답변 선택 (질문 작성자만)
  // ========================================
  async selectBest(answerId: string, userId: string) {
    const answer = await this.prisma.answer.findUnique({
      where: { id: answerId },
      include: {
        post: {
          select: { authorId: true, anonymousAuthorId: true },
        },
      },
    });

    if (!answer) {
      throw new NotFoundException('답변을 찾을 수 없습니다');
    }

    // 질문 작성자 확인
    const postAuthorId = answer.post.authorId || answer.post.anonymousAuthorId;
    if (postAuthorId !== userId) {
      throw new ForbiddenException('질문 작성자만 베스트 답변을 선택할 수 있습니다');
    }

    // 트랜잭션으로 기존 베스트 해제 + 새 베스트 선택
    await this.prisma.$transaction([
      // 기존 베스트 답변 해제
      this.prisma.answer.updateMany({
        where: {
          postId: answer.postId,
          isBest: true,
        },
        data: {
          isBest: false,
          bestSelectedAt: null,
        },
      }),
      // 새 베스트 답변 선택
      this.prisma.answer.update({
        where: { id: answerId },
        data: {
          isBest: true,
          bestSelectedAt: new Date(),
        },
      }),
    ]);

    return this.prisma.answer.findUnique({
      where: { id: answerId },
      include: {
        author: {
          select: {
            id: true,
            nickname: true,
            isExpert: true,
            expertType: true,
            profileImage: true,
          },
        },
      },
    });
  }
}
