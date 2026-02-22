import { Injectable, Inject } from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { PrismaService } from '../database/prisma.service';
import { MailService } from '../mail/mail.service';
import { CreateInquiryDto } from './dto/create-inquiry.dto';
import { InquiryStatus } from '@prisma/client';

@Injectable()
export class InquiriesService {
  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {}

  async create(createInquiryDto: CreateInquiryDto) {
    const inquiry = await this.prisma.inquiry.create({
      data: {
        type: createInquiryDto.type,
        email: createInquiryDto.email,
        subject: createInquiryDto.subject,
        content: createInquiryDto.content,
        userId: createInquiryDto.userId,
        status: InquiryStatus.PENDING,
      },
    });

    // 관리자에게 알림 이메일 발송 (선택)
    try {
      await this.mailService.sendInquiryNotification(inquiry);
    } catch (error) {
      // 알림 실패해도 문의는 정상 저장됨
      this.logger.error('Failed to send inquiry notification email', error, 'InquiriesService');
    }

    this.logger.log(`New inquiry created: ${inquiry.id}`, 'InquiriesService');

    return {
      id: inquiry.id,
      message: '문의가 접수되었습니다. 빠른 시일 내에 답변 드리겠습니다.',
    };
  }

  async findAll(page = 1, limit = 20, status?: InquiryStatus) {
    const skip = (page - 1) * limit;
    const where = status ? { status } : {};

    const [inquiries, total] = await Promise.all([
      this.prisma.inquiry.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.inquiry.count({ where }),
    ]);

    return {
      data: inquiries,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    return this.prisma.inquiry.findUnique({
      where: { id },
    });
  }

  async respond(id: string, response: string, respondedById: string) {
    const inquiry = await this.prisma.inquiry.update({
      where: { id },
      data: {
        response,
        respondedById,
        respondedAt: new Date(),
        status: InquiryStatus.RESOLVED,
      },
    });

    // 사용자에게 답변 이메일 발송
    try {
      await this.mailService.sendInquiryResponse(inquiry);
    } catch (error) {
      this.logger.error('Failed to send inquiry response email', error, 'InquiriesService');
    }

    return inquiry;
  }

  async updateStatus(id: string, status: InquiryStatus) {
    return this.prisma.inquiry.update({
      where: { id },
      data: { status },
    });
  }
}
