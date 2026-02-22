import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Notifications')
@ApiBearerAuth('access-token')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * 내 알림 목록
   */
  @Get()
  async findAll(
    @Req() req: Request,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const user = req.user as { sub: string };
    const parsedPage = page ? Math.max(1, parseInt(page, 10) || 1) : 1;
    const parsedLimit = limit ? Math.min(100, Math.max(1, parseInt(limit, 10) || 20)) : 20;
    return this.notificationsService.findAllByUser(
      user.sub,
      parsedPage,
      parsedLimit,
    );
  }

  /**
   * 읽지 않은 알림 개수
   */
  @Get('unread-count')
  async getUnreadCount(@Req() req: Request) {
    const user = req.user as { sub: string };
    const count = await this.notificationsService.getUnreadCount(user.sub);
    return { count };
  }

  /**
   * 알림 읽음 처리
   */
  @Patch(':id/read')
  async markAsRead(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as { sub: string };
    await this.notificationsService.markAsRead(user.sub, id);
    return { message: '알림을 읽음 처리했습니다' };
  }

  /**
   * 모든 알림 읽음 처리
   */
  @Patch('read-all')
  async markAllAsRead(@Req() req: Request) {
    const user = req.user as { sub: string };
    await this.notificationsService.markAllAsRead(user.sub);
    return { message: '모든 알림을 읽음 처리했습니다' };
  }

  /**
   * 알림 삭제
   */
  @Delete(':id')
  async delete(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as { sub: string };
    await this.notificationsService.delete(user.sub, id);
    return { message: '알림이 삭제되었습니다' };
  }
}
