import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateVerificationRequestDto } from './dto/create-verification-request.dto';
import { ProcessVerificationDto } from './dto/process-verification.dto';
import { VerificationStatus, NotificationType } from '@prisma/client';

@Injectable()
export class VerificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadsService: UploadsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * 인증 요청 생성 (사용자)
   */
  async create(
    userId: string,
    dto: CreateVerificationRequestDto,
    file: Express.Multer.File,
  ) {
    // 이미 대기 중인 요청이 있는지 확인
    const existing = await this.prisma.verificationRequest.findFirst({
      where: { userId, status: VerificationStatus.PENDING },
    });

    if (existing) {
      throw new BadRequestException('이미 대기 중인 인증 요청이 있습니다');
    }

    // 파일 저장
    const fileInfo = await this.uploadsService.saveVerificationFile(
      file,
      userId,
    );

    // 요청 생성
    return this.prisma.verificationRequest.create({
      data: {
        userId,
        verificationType: dto.verificationType,
        note: dto.note,
        fileUrl: fileInfo.fileUrl,
        originalFileName: fileInfo.originalFileName,
        fileType: fileInfo.fileType,
        fileSize: fileInfo.fileSize,
        isEncrypted: fileInfo.isEncrypted,
      },
    });
  }

  /**
   * 내 인증 요청 목록 (사용자)
   */
  findMyRequests(userId: string) {
    return this.prisma.verificationRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * 내 최신 인증 상태 (사용자)
   */
  async getMyLatestStatus(userId: string) {
    const latestRequest = await this.prisma.verificationRequest.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return {
      hasRequest: !!latestRequest,
      latestStatus: latestRequest?.status || null,
      latestRequest,
    };
  }

  /**
   * 인증 요청 목록 (관리자)
   */
  async findAll(page = 1, limit = 20, status?: VerificationStatus) {
    const skip = (page - 1) * limit;
    const where = status ? { status } : {};

    const [data, total] = await Promise.all([
      this.prisma.verificationRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              nickname: true,
              email: true,
              jobType: true,
              career: true,
              isVerified: true,
            },
          },
          processedBy: {
            select: { id: true, nickname: true },
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
   * 인증 요청 상세 (관리자)
   */
  async findOne(id: string) {
    const request = await this.prisma.verificationRequest.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            nickname: true,
            email: true,
            jobType: true,
            career: true,
            isVerified: true,
          },
        },
        processedBy: {
          select: { id: true, nickname: true },
        },
      },
    });

    if (!request) {
      throw new NotFoundException('인증 요청을 찾을 수 없습니다');
    }

    return request;
  }

  /**
   * 인증 처리 (관리자) - 승인/반려
   */
  async process(id: string, adminId: string, dto: ProcessVerificationDto) {
    const request = await this.findOne(id);

    if (request.status !== VerificationStatus.PENDING) {
      throw new BadRequestException('이미 처리된 요청입니다');
    }

    // 반려 시 사유 필수
    if (
      dto.status === VerificationStatus.REJECTED &&
      !dto.rejectionReason?.trim()
    ) {
      throw new BadRequestException('반려 사유를 입력해주세요');
    }

    // PENDING 상태로 변경하려는 경우 방지
    if (dto.status === VerificationStatus.PENDING) {
      throw new BadRequestException('대기 상태로 변경할 수 없습니다');
    }

    // 트랜잭션으로 처리
    const result = await this.prisma.$transaction(async (tx) => {
      // 요청 상태 업데이트
      const updated = await tx.verificationRequest.update({
        where: { id },
        data: {
          status: dto.status,
          processedById: adminId,
          processedAt: new Date(),
          rejectionReason:
            dto.status === VerificationStatus.REJECTED
              ? dto.rejectionReason
              : null,
        },
        include: {
          user: {
            select: {
              id: true,
              nickname: true,
              email: true,
              jobType: true,
              career: true,
              isVerified: true,
            },
          },
          processedBy: {
            select: { id: true, nickname: true },
          },
        },
      });

      // 승인 시 User.isVerified = true 설정
      if (dto.status === VerificationStatus.APPROVED) {
        await tx.user.update({
          where: { id: request.userId },
          data: { isVerified: true },
        });
      }

      return updated;
    });

    // 알림 발송
    const notificationType =
      dto.status === VerificationStatus.APPROVED
        ? NotificationType.VERIFICATION_APPROVED
        : NotificationType.VERIFICATION_REJECTED;

    await this.notificationsService.create({
      type: notificationType,
      userId: request.userId,
      actorId: adminId,
    });

    return result;
  }

  /**
   * 대기 중인 요청 수 (관리자 대시보드용)
   */
  getPendingCount(): Promise<number> {
    return this.prisma.verificationRequest.count({
      where: { status: VerificationStatus.PENDING },
    });
  }
}
