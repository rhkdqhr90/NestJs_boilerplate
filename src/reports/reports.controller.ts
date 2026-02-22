import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';
import { ReportsService } from './reports.service';
import { CreateReportDto } from './dto/create-report.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const MAX_LIMIT = 100;

function parseLimit(limit?: string, defaultValue = 10): number {
  const parsed = limit ? parseInt(limit, 10) : defaultValue;
  return Math.min(Math.max(1, parsed), MAX_LIMIT);
}

function parsePage(page?: string): number {
  const parsed = page ? parseInt(page, 10) : 1;
  return Math.max(1, parsed);
}

@ApiTags('Reports')
@ApiBearerAuth('access-token')
@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  /**
   * 신고 생성
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 1분에 10회
  async create(@Req() req: Request, @Body() dto: CreateReportDto) {
    const user = req.user as JwtPayload;
    return this.reportsService.create(user.sub, dto);
  }

  /**
   * 내 신고 목록 조회
   */
  @Get('my')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async findMyReports(
    @Req() req: Request,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const user = req.user as JwtPayload;
    return this.reportsService.findMyReports(
      user.sub,
      parsePage(page),
      parseLimit(limit),
    );
  }
}
