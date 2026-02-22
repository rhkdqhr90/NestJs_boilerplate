import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateBannerDto } from './dto/create-banner.dto';
import { UpdateBannerDto } from './dto/update-banner.dto';
import { BannerType } from '@prisma/client';

@Injectable()
export class BannersService {
  constructor(private prisma: PrismaService) {}

  // 배너 생성 (관리자)
  async create(dto: CreateBannerDto) {
    return this.prisma.banner.create({
      data: {
        title: dto.title,
        imageUrl: dto.imageUrl,
        linkUrl: dto.linkUrl,
        alt: dto.alt,
        type: dto.type || BannerType.PROMO,
        isActive: dto.isActive ?? true,
        priority: dto.priority ?? 0,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
      },
    });
  }

  // 전체 배너 목록 (관리자용)
  async findAll(type?: BannerType) {
    return this.prisma.banner.findMany({
      where: type ? { type } : undefined,
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
  }

  // 활성 배너 목록 (공개용)
  async findActive(type: BannerType) {
    const now = new Date();
    return this.prisma.banner.findMany({
      where: {
        type,
        isActive: true,
        OR: [
          { startDate: null, endDate: null },
          { startDate: { lte: now }, endDate: null },
          { startDate: null, endDate: { gte: now } },
          { startDate: { lte: now }, endDate: { gte: now } },
        ],
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
  }

  // 배너 상세 조회
  async findOne(id: string) {
    const banner = await this.prisma.banner.findUnique({
      where: { id },
    });

    if (!banner) {
      throw new NotFoundException('배너를 찾을 수 없습니다.');
    }

    return banner;
  }

  // 배너 수정
  async update(id: string, dto: UpdateBannerDto) {
    await this.findOne(id);

    return this.prisma.banner.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
        ...(dto.linkUrl !== undefined && { linkUrl: dto.linkUrl }),
        ...(dto.alt !== undefined && { alt: dto.alt }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.priority !== undefined && { priority: dto.priority }),
        ...(dto.startDate !== undefined && { startDate: dto.startDate ? new Date(dto.startDate) : null }),
        ...(dto.endDate !== undefined && { endDate: dto.endDate ? new Date(dto.endDate) : null }),
      },
    });
  }

  // 배너 삭제
  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.banner.delete({ where: { id } });
  }

  // 활성화 토글
  async toggleActive(id: string) {
    const banner = await this.findOne(id);
    return this.prisma.banner.update({
      where: { id },
      data: { isActive: !banner.isActive },
    });
  }
}
