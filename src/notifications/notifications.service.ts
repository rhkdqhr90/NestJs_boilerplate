import { Injectable } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 알림 생성 (댓글/대댓글/좋아요/멘션)
   */
  async create(params: {
    type: NotificationType;
    userId: string; // 알림 받는 사람
    actorId?: string; // 알림 발생시킨 사람
    postId?: string;
    commentId?: string;
  }) {
    // 자기 자신에게는 알림 보내지 않음
    if (params.actorId && params.userId === params.actorId) {
      return null;
    }

    return this.prisma.notification.create({
      data: {
        type: params.type,
        userId: params.userId,
        actorId: params.actorId,
        postId: params.postId,
        commentId: params.commentId,
      },
    });
  }

  /**
   * 내 알림 목록 조회
   */
  async findAllByUser(userId: string, page: number = 1, limit: number = 20) {
    const maxLimit = 50;
    const safeLimit = Math.min(limit, maxLimit);
    const skip = (page - 1) * safeLimit;

    const [notifications, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        skip,
        take: safeLimit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count({ where: { userId } }),
      this.prisma.notification.count({ where: { userId, isRead: false } }),
    ]);

    // 관련 데이터 조회 (actor, post 정보)
    const actorIds = [
      ...new Set(notifications.map((n) => n.actorId).filter(Boolean)),
    ];
    const postIds = [
      ...new Set(notifications.map((n) => n.postId).filter(Boolean)),
    ];

    const [actors, posts] = await Promise.all([
      actorIds.length > 0
        ? this.prisma.user.findMany({
            where: { id: { in: actorIds as string[] } },
            select: { id: true, nickname: true },
          })
        : [],
      postIds.length > 0
        ? this.prisma.post.findMany({
            where: { id: { in: postIds as string[] } },
            select: { id: true, title: true },
          })
        : [],
    ]);

    const actorMap = new Map(actors.map((a) => [a.id, a] as const));
    const postMap = new Map(posts.map((p) => [p.id, p] as const));

    const data = notifications.map((n) => ({
      id: n.id,
      type: n.type,
      actor: n.actorId ? actorMap.get(n.actorId) || null : null,
      post: n.postId ? postMap.get(n.postId) || null : null,
      commentId: n.commentId,
      isRead: n.isRead,
      createdAt: n.createdAt,
    }));

    return {
      data,
      meta: {
        page,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
        unreadCount,
      },
    };
  }

  /**
   * 읽지 않은 알림 개수
   */
  async getUnreadCount(userId: string) {
    return this.prisma.notification.count({
      where: { userId, isRead: false },
    });
  }

  /**
   * 알림 읽음 처리
   */
  async markAsRead(userId: string, notificationId: string) {
    return this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { isRead: true, readAt: new Date() },
    });
  }

  /**
   * 모든 알림 읽음 처리
   */
  async markAllAsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
  }

  /**
   * 알림 삭제
   */
  async delete(userId: string, notificationId: string) {
    return this.prisma.notification.deleteMany({
      where: { id: notificationId, userId },
    });
  }
}
