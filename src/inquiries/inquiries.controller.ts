import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { InquiriesService } from './inquiries.service';
import { CreateInquiryDto } from './dto/create-inquiry.dto';
import { RespondInquiryDto } from './dto/respond-inquiry.dto';
import { UpdateInquiryStatusDto } from './dto/update-inquiry-status.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Inquiries')
@Controller('inquiries')
export class InquiriesController {
  constructor(private readonly inquiriesService: InquiriesService) {}

  @Post()
  @ApiOperation({ summary: '문의 접수', description: '고객 문의를 접수합니다. 비회원도 가능합니다.' })
  @ApiResponse({ status: 201, description: '문의 접수 성공' })
  @Throttle({ strict: { ttl: 900000, limit: 5 } }) // 15분에 5번 (스팸 방지)
  async create(@Body() createInquiryDto: CreateInquiryDto, @Request() req: any) {
    // JWT 토큰이 있으면 userId 추출 (선택)
    if (req.user?.sub) {
      createInquiryDto.userId = req.user.sub;
    }
    return this.inquiriesService.create(createInquiryDto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '[관리자] 문의 목록 조회' })
  @ApiResponse({ status: 200, description: '문의 목록' })
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    const parsedPage = page ? Math.max(1, parseInt(page, 10) || 1) : 1;
    const parsedLimit = limit ? Math.min(100, Math.max(1, parseInt(limit, 10) || 20)) : 20;
    return this.inquiriesService.findAll(parsedPage, parsedLimit, status as any);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '[관리자] 문의 상세 조회' })
  @ApiResponse({ status: 200, description: '문의 상세' })
  async findOne(@Param('id') id: string) {
    return this.inquiriesService.findOne(id);
  }

  @Patch(':id/respond')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '[관리자] 문의 답변' })
  @ApiResponse({ status: 200, description: '답변 완료' })
  async respond(
    @Param('id') id: string,
    @Body() dto: RespondInquiryDto,
    @Request() req: any,
  ) {
    return this.inquiriesService.respond(id, dto.response, req.user.sub);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '[관리자] 문의 상태 변경' })
  @ApiResponse({ status: 200, description: '상태 변경 완료' })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateInquiryStatusDto,
  ) {
    return this.inquiriesService.updateStatus(id, dto.status);
  }
}
