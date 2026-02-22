import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';

@Injectable()
export class AnnouncementsService {
  constructor(private prisma: PrismaService) {}

  async create(createAnnouncementDto: CreateAnnouncementDto, authorId: string) {
    return this.prisma.announcement.create({
      data: {
        ...createAnnouncementDto,
        authorId,
      },
    });
  }

  async findAll(includeUnpublished = false) {
    const where = includeUnpublished ? {} : { isPublished: true };

    return this.prisma.announcement.findMany({
      where,
      orderBy: [
        { isPinned: 'desc' },
        { createdAt: 'desc' },
      ],
    });
  }

  async findOne(id: string) {
    const announcement = await this.prisma.announcement.findUnique({
      where: { id },
    });

    if (!announcement) {
      throw new NotFoundException('공지사항을 찾을 수 없습니다.');
    }

    return announcement;
  }

  async update(id: string, updateAnnouncementDto: UpdateAnnouncementDto) {
    await this.findOne(id); // 존재 확인

    return this.prisma.announcement.update({
      where: { id },
      data: updateAnnouncementDto,
    });
  }

  async remove(id: string) {
    await this.findOne(id); // 존재 확인

    return this.prisma.announcement.delete({
      where: { id },
    });
  }

  async togglePin(id: string) {
    const announcement = await this.findOne(id);

    return this.prisma.announcement.update({
      where: { id },
      data: { isPinned: !announcement.isPinned },
    });
  }

  async togglePublish(id: string) {
    const announcement = await this.findOne(id);

    return this.prisma.announcement.update({
      where: { id },
      data: { isPublished: !announcement.isPublished },
    });
  }
}
