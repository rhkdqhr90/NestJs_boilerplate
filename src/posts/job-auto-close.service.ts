import { Injectable, Inject } from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { PrismaService } from '../database/prisma.service';
import { PostCategory } from '@prisma/client';

@Injectable()
export class JobAutoCloseService {
  private isRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {}

  /**
   * 매일 자정에 마감일이 지난 구인공고 자동 마감
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleCron() {
    if (this.isRunning) {
      this.logger.warn('Job auto-close already running, skipping...', 'JobAutoCloseService');
      return;
    }
    this.isRunning = true;
    this.logger.log('Starting job auto-close check...', 'JobAutoCloseService');
    try {
      await this.closeExpiredJobs();
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * 마감일이 지난 구인공고 자동 마감 처리
   */
  async closeExpiredJobs(): Promise<{ closed: number }> {
    const now = new Date();

    try {
      // 마감일이 지났고, isAutoClose가 true이고, 아직 모집중인 공고 찾기
      const expiredJobs = await this.prisma.post.updateMany({
        where: {
          category: PostCategory.JOB_POSTING,
          isRecruiting: true,
          isAutoClose: true,
          deadline: {
            lt: now, // 마감일이 현재 시간보다 이전
          },
        },
        data: {
          isRecruiting: false,
        },
      });

      if (expiredJobs.count > 0) {
        this.logger.log(
          `Auto-closed ${expiredJobs.count} expired job postings`,
          'JobAutoCloseService',
        );
      }

      return { closed: expiredJobs.count };
    } catch (error) {
      this.logger.error(
        `Job auto-close failed: ${error}`,
        'JobAutoCloseService',
      );
      return { closed: 0 };
    }
  }
}
