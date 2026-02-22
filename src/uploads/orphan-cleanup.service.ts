import { Injectable, Inject } from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { PrismaService } from '../database/prisma.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class OrphanCleanupService {
  private readonly uploadDir: string;
  // 파일이 생성된 후 이 시간이 지나야 고아 파일로 간주 (1시간)
  private readonly orphanThresholdMs = 60 * 60 * 1000;
  // Cron job 중복 실행 방지
  private isRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {
    this.uploadDir = path.join(process.cwd(), 'uploads');
  }

  /**
   * 매일 새벽 3시에 고아 파일 정리 실행
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleCron() {
    if (this.isRunning) {
      this.logger.warn('Orphan cleanup already running, skipping...', 'OrphanCleanupService');
      return;
    }
    this.logger.log('Starting orphan file cleanup...', 'OrphanCleanupService');
    await this.cleanupOrphanFiles();
  }

  /**
   * 수동 실행용 (관리자 API에서 호출 가능)
   */
  async cleanupOrphanFiles(): Promise<{ deleted: number; errors: number }> {
    if (this.isRunning) {
      return { deleted: 0, errors: 0 };
    }
    this.isRunning = true;

    let deleted = 0;
    let errors = 0;

    try {
      // 1. 게시글 이미지 정리
      const postResult = await this.cleanupPostImages();
      deleted += postResult.deleted;
      errors += postResult.errors;

      // 2. 프로필 이미지 정리
      const profileResult = await this.cleanupProfileImages();
      deleted += profileResult.deleted;
      errors += profileResult.errors;

      this.logger.log(
        `Orphan cleanup completed: ${deleted} files deleted, ${errors} errors`,
        'OrphanCleanupService',
      );
    } catch (error) {
      this.logger.error(
        `Orphan cleanup failed: ${error}`,
        'OrphanCleanupService',
      );
    } finally {
      this.isRunning = false;
    }

    return { deleted, errors };
  }

  /**
   * 게시글 이미지 정리
   * - uploads/post/ 디렉토리의 파일 중 어떤 게시글에도 참조되지 않는 파일 삭제
   */
  private async cleanupPostImages(): Promise<{
    deleted: number;
    errors: number;
  }> {
    let deleted = 0;
    let errors = 0;

    const postDir = path.join(this.uploadDir, 'post');
    if (!fs.existsSync(postDir)) {
      return { deleted, errors };
    }

    // 배치 처리: 게시글을 500개씩 나눠서 메모리 사용량 제어
    const usedImages = new Set<string>();
    const imageUrlRegex = /\/uploads\/post\/([a-zA-Z0-9_\-.]+)/g;
    const BATCH_SIZE = 500;
    let skip = 0;

    while (true) {
      const posts = await this.prisma.post.findMany({
        select: { content: true },
        skip,
        take: BATCH_SIZE,
      });

      if (posts.length === 0) break;

      for (const post of posts) {
        imageUrlRegex.lastIndex = 0; // 정규식 상태 리셋 (g 플래그 재사용 시 필수)
        let match: RegExpExecArray | null;
        while ((match = imageUrlRegex.exec(post.content)) !== null) {
          usedImages.add(match[1]); // 파일명만 저장
        }
      }

      skip += BATCH_SIZE;
      if (posts.length < BATCH_SIZE) break;
    }

    // 디렉토리의 모든 파일 확인
    const files = await fs.promises.readdir(postDir);
    const now = Date.now();

    for (const filename of files) {
      try {
        const filePath = path.join(postDir, filename);
        const stat = await fs.promises.stat(filePath);

        // 파일이 최근에 생성되었으면 스킵 (업로드 중일 수 있음)
        if (now - stat.mtimeMs < this.orphanThresholdMs) {
          continue;
        }

        // 사용 중이지 않으면 삭제
        if (!usedImages.has(filename)) {
          await fs.promises.unlink(filePath);
          deleted++;
          this.logger.log(
            `Deleted orphan post image: ${filename}`,
            'OrphanCleanupService',
          );
        }
      } catch (error) {
        errors++;
        this.logger.warn(
          `Failed to process file ${filename}: ${error}`,
          'OrphanCleanupService',
        );
      }
    }

    return { deleted, errors };
  }

  /**
   * 프로필 이미지 정리
   * - uploads/profile/ 디렉토리의 파일 중 어떤 사용자도 참조하지 않는 파일 삭제
   */
  private async cleanupProfileImages(): Promise<{
    deleted: number;
    errors: number;
  }> {
    let deleted = 0;
    let errors = 0;

    const profileDir = path.join(this.uploadDir, 'profile');
    if (!fs.existsSync(profileDir)) {
      return { deleted, errors };
    }

    // 모든 사용자의 profileImage 조회
    const users = await this.prisma.user.findMany({
      select: { profileImage: true },
      where: { profileImage: { not: null } },
    });

    // 사용 중인 이미지 파일명 Set 생성
    const usedImages = new Set<string>();
    for (const user of users) {
      if (user.profileImage) {
        // /uploads/profile/filename.ext에서 filename.ext 추출
        const filename = user.profileImage.replace('/uploads/profile/', '');
        usedImages.add(filename);
      }
    }

    // 디렉토리의 모든 파일 확인
    const files = await fs.promises.readdir(profileDir);
    const now = Date.now();

    for (const filename of files) {
      try {
        const filePath = path.join(profileDir, filename);
        const stat = await fs.promises.stat(filePath);

        // 파일이 최근에 생성되었으면 스킵 (업로드 중일 수 있음)
        if (now - stat.mtimeMs < this.orphanThresholdMs) {
          continue;
        }

        // 사용 중이지 않으면 삭제
        if (!usedImages.has(filename)) {
          await fs.promises.unlink(filePath);
          deleted++;
          this.logger.log(
            `Deleted orphan profile image: ${filename}`,
            'OrphanCleanupService',
          );
        }
      } catch (error) {
        errors++;
        this.logger.warn(
          `Failed to process file ${filename}: ${error}`,
          'OrphanCleanupService',
        );
      }
    }

    return { deleted, errors };
  }
}
