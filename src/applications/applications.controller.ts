import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ApplicationsService } from './applications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import {
  CreateApplicationDto,
  UpdateApplicationStatusDto,
  ApplicationResponseDto,
} from './dto';

@ApiTags('Applications')
@ApiBearerAuth('access-token')
@Controller('applications')
@UseGuards(JwtAuthGuard)
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Post()
  async create(
    @Req() req: Request,
    @Body() dto: CreateApplicationDto,
  ): Promise<ApplicationResponseDto> {
    const user = req.user as JwtPayload;
    return this.applicationsService.create(user.sub, dto);
  }

  @Get('my')
  async findMyApplications(
    @Req() req: Request,
  ): Promise<ApplicationResponseDto[]> {
    const user = req.user as JwtPayload;
    return this.applicationsService.findMyApplications(user.sub);
  }

  @Get('post/:postId')
  async findByPost(
    @Param('postId') postId: string,
    @Req() req: Request,
  ): Promise<ApplicationResponseDto[]> {
    const user = req.user as JwtPayload;
    return this.applicationsService.findByPost(postId, user.sub);
  }

  @Get('post/:postId/check')
  async checkApplied(
    @Param('postId') postId: string,
    @Req() req: Request,
  ): Promise<{ applied: boolean }> {
    const user = req.user as JwtPayload;
    const applied = await this.applicationsService.hasApplied(postId, user.sub);
    return { applied };
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @Req() req: Request,
  ): Promise<ApplicationResponseDto> {
    const user = req.user as JwtPayload;
    return this.applicationsService.findOne(id, user.sub);
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Req() req: Request,
    @Body() dto: UpdateApplicationStatusDto,
  ): Promise<ApplicationResponseDto> {
    const user = req.user as JwtPayload;
    return this.applicationsService.updateStatus(id, user.sub, dto);
  }

  @Delete(':id')
  async cancel(
    @Param('id') id: string,
    @Req() req: Request,
  ): Promise<{ message: string }> {
    const user = req.user as JwtPayload;
    await this.applicationsService.cancel(id, user.sub);
    return { message: '지원이 취소되었습니다.' };
  }
}
