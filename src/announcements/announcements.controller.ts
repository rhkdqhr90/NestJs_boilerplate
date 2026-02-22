import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AnnouncementsService } from './announcements.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Announcements')
@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @SkipThrottle({ strict: true })
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '[관리자] 공지사항 작성' })
  @ApiResponse({ status: 201, description: '공지사항 작성 성공' })
  create(@Body() createAnnouncementDto: CreateAnnouncementDto, @Request() req: any) {
    return this.announcementsService.create(createAnnouncementDto, req.user.sub);
  }

  @Get()
  @ApiOperation({ summary: '공지사항 목록 조회 (공개 글만)' })
  @ApiResponse({ status: 200, description: '공지사항 목록' })
  findAll() {
    // 일반 사용자는 공개된 공지사항만 조회
    return this.announcementsService.findAll(false);
  }

  @Get('admin/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @SkipThrottle({ strict: true })
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '[관리자] 공지사항 전체 목록 조회 (비공개 포함)' })
  @ApiResponse({ status: 200, description: '공지사항 전체 목록' })
  findAllAdmin() {
    return this.announcementsService.findAll(true);
  }

  @Get(':id')
  @ApiOperation({ summary: '공지사항 상세 조회' })
  @ApiResponse({ status: 200, description: '공지사항 상세' })
  findOne(@Param('id') id: string) {
    return this.announcementsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @SkipThrottle({ strict: true })
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '[관리자] 공지사항 수정' })
  @ApiResponse({ status: 200, description: '공지사항 수정 성공' })
  update(@Param('id') id: string, @Body() updateAnnouncementDto: UpdateAnnouncementDto) {
    return this.announcementsService.update(id, updateAnnouncementDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @SkipThrottle({ strict: true })
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '[관리자] 공지사항 삭제' })
  @ApiResponse({ status: 200, description: '공지사항 삭제 성공' })
  remove(@Param('id') id: string) {
    return this.announcementsService.remove(id);
  }

  @Patch(':id/pin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @SkipThrottle({ strict: true })
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '[관리자] 공지사항 고정 토글' })
  @ApiResponse({ status: 200, description: '고정 상태 변경' })
  togglePin(@Param('id') id: string) {
    return this.announcementsService.togglePin(id);
  }

  @Patch(':id/publish')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @SkipThrottle({ strict: true })
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '[관리자] 공지사항 공개 토글' })
  @ApiResponse({ status: 200, description: '공개 상태 변경' })
  togglePublish(@Param('id') id: string) {
    return this.announcementsService.togglePublish(id);
  }
}
