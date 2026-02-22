import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CreateApplicationDto,
  UpdateApplicationStatusDto,
  ApplicationResponseDto,
} from './dto';
import { ApplicationStatus, PostCategory, NotificationType } from '@prisma/client';

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(
    userId: string,
    dto: CreateApplicationDto,
  ): Promise<ApplicationResponseDto> {
    // 게시글 확인
    const post = await this.prisma.post.findUnique({
      where: { id: dto.postId },
      include: { author: true },
    });

    if (!post) {
      throw new NotFoundException('게시글을 찾을 수 없습니다.');
    }

    if (post.category !== PostCategory.JOB_POSTING) {
      throw new BadRequestException('구인공고에만 지원할 수 있습니다.');
    }

    if (!post.isRecruiting) {
      throw new BadRequestException('마감된 공고입니다.');
    }

    // 자기 공고에 지원 불가
    if (post.authorId === userId) {
      throw new BadRequestException('본인이 작성한 공고에는 지원할 수 없습니다.');
    }

    // 중복 지원 확인
    const existingApplication = await this.prisma.application.findUnique({
      where: {
        postId_applicantId: {
          postId: dto.postId,
          applicantId: userId,
        },
      },
    });

    if (existingApplication) {
      throw new ConflictException('이미 지원한 공고입니다.');
    }

    // 지원 생성
    const application = await this.prisma.application.create({
      data: {
        postId: dto.postId,
        applicantId: userId,
        coverLetter: dto.coverLetter,
        contactPhone: dto.contactPhone,
        contactEmail: dto.contactEmail,
      },
      include: {
        post: true,
        applicant: true,
      },
    });

    // 채용 담당자에게 알림
    if (post.authorId) {
      this.notificationsService.create({
        userId: post.authorId,
        actorId: userId,
        type: NotificationType.NEW_APPLICATION,
        postId: post.id,
      }).catch(() => {
        // 알림 생성 실패는 지원 프로세스에 영향을 주지 않도록 무시
      });
    }

    return new ApplicationResponseDto(application);
  }

  async findMyApplications(userId: string): Promise<ApplicationResponseDto[]> {
    const applications = await this.prisma.application.findMany({
      where: { applicantId: userId },
      include: {
        post: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return applications.map((app) => new ApplicationResponseDto(app));
  }

  async findByPost(
    postId: string,
    userId: string,
  ): Promise<ApplicationResponseDto[]> {
    // 게시글 확인 및 권한 체크
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
    });

    if (!post) {
      throw new NotFoundException('게시글을 찾을 수 없습니다.');
    }

    if (post.authorId !== userId) {
      throw new ForbiddenException('지원자 목록을 볼 권한이 없습니다.');
    }

    const applications = await this.prisma.application.findMany({
      where: { postId },
      include: {
        applicant: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return applications.map((app) => new ApplicationResponseDto(app));
  }

  async findOne(id: string, userId: string): Promise<ApplicationResponseDto> {
    const application = await this.prisma.application.findUnique({
      where: { id },
      include: {
        post: {
          include: { author: true },
        },
        applicant: true,
      },
    });

    if (!application) {
      throw new NotFoundException('지원 내역을 찾을 수 없습니다.');
    }

    // 본인 지원이거나 채용 담당자만 조회 가능
    const isApplicant = application.applicantId === userId;
    const isRecruiter = application.post.authorId === userId;

    if (!isApplicant && !isRecruiter) {
      throw new ForbiddenException('조회 권한이 없습니다.');
    }

    return new ApplicationResponseDto(application);
  }

  async updateStatus(
    id: string,
    userId: string,
    dto: UpdateApplicationStatusDto,
  ): Promise<ApplicationResponseDto> {
    const application = await this.prisma.application.findUnique({
      where: { id },
      include: {
        post: true,
        applicant: true,
      },
    });

    if (!application) {
      throw new NotFoundException('지원 내역을 찾을 수 없습니다.');
    }

    // 채용 담당자만 상태 변경 가능
    if (application.post.authorId !== userId) {
      throw new ForbiddenException('상태를 변경할 권한이 없습니다.');
    }

    const updated = await this.prisma.application.update({
      where: { id },
      data: {
        status: dto.status,
        recruiterNote: dto.recruiterNote,
      },
      include: {
        post: true,
        applicant: true,
      },
    });

    // 지원자에게 상태 변경 알림
    await this.notificationsService.create({
      userId: application.applicantId,
      actorId: userId,
      type: NotificationType.APPLICATION_STATUS,
      postId: application.postId,
    });

    return new ApplicationResponseDto(updated);
  }

  async cancel(id: string, userId: string): Promise<void> {
    const application = await this.prisma.application.findUnique({
      where: { id },
      include: { post: true },
    });

    if (!application) {
      throw new NotFoundException('지원 내역을 찾을 수 없습니다.');
    }

    // 본인만 취소 가능
    if (application.applicantId !== userId) {
      throw new ForbiddenException('지원을 취소할 권한이 없습니다.');
    }

    // 이미 처리된 지원은 취소 불가
    if (
      application.status === ApplicationStatus.ACCEPTED ||
      application.status === ApplicationStatus.REJECTED
    ) {
      throw new BadRequestException('이미 처리된 지원은 취소할 수 없습니다.');
    }

    await this.prisma.application.update({
      where: { id },
      data: { status: ApplicationStatus.CANCELLED },
    });
  }

  async getApplicationCount(postId: string): Promise<number> {
    return this.prisma.application.count({
      where: {
        postId,
        status: { not: ApplicationStatus.CANCELLED },
      },
    });
  }

  async hasApplied(postId: string, userId: string): Promise<boolean> {
    const application = await this.prisma.application.findUnique({
      where: {
        postId_applicantId: {
          postId,
          applicantId: userId,
        },
      },
    });
    return !!application;
  }
}
