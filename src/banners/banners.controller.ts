import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { BannersService } from './banners.service';
import { CreateBannerDto } from './dto/create-banner.dto';
import { UpdateBannerDto } from './dto/update-banner.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole, BannerType } from '@prisma/client';

@Controller('banners')
export class BannersController {
  constructor(private readonly bannersService: BannersService) {}

  // ========================================
  // 공개 API
  // ========================================

  // 활성 프로모션 배너 조회 (홈 캐러셀용)
  @Get('promo')
  findActivePromo() {
    return this.bannersService.findActive(BannerType.PROMO);
  }

  // 활성 사이드바 배너 조회 (광고용)
  @Get('sidebar')
  findActiveSidebar() {
    return this.bannersService.findActive(BannerType.SIDEBAR);
  }

  // ========================================
  // 관리자 API
  // ========================================

  // 배너 생성
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @SkipThrottle({ strict: true })
  create(@Body() createBannerDto: CreateBannerDto) {
    return this.bannersService.create(createBannerDto);
  }

  // 전체 배너 목록 (관리자용)
  @Get('admin/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @SkipThrottle({ strict: true })
  findAll(@Query('type') type?: BannerType) {
    return this.bannersService.findAll(type);
  }

  // 배너 상세 조회 (관리자용)
  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @SkipThrottle({ strict: true })
  findOne(@Param('id') id: string) {
    return this.bannersService.findOne(id);
  }

  // 배너 수정
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @SkipThrottle({ strict: true })
  update(@Param('id') id: string, @Body() updateBannerDto: UpdateBannerDto) {
    return this.bannersService.update(id, updateBannerDto);
  }

  // 배너 삭제
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @SkipThrottle({ strict: true })
  remove(@Param('id') id: string) {
    return this.bannersService.remove(id);
  }

  // 활성화 토글
  @Patch(':id/toggle')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @SkipThrottle({ strict: true })
  toggleActive(@Param('id') id: string) {
    return this.bannersService.toggleActive(id);
  }
}
