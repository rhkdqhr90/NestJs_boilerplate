import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

/**
 * 만료된 토큰 정리 서비스
 *
 * - 1시간마다 만료된 RefreshToken 및 TokenBlacklist 삭제
 * - setInterval 기반 (외부 패키지 의존 없음)
 * - OnModuleDestroy로 리소스 누수 방지
 */
@Injectable()
export class TokenCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TokenCleanupService.name);
  private readonly CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1시간
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    // 서버 시작 시 즉시 한 번 실행
    this.cleanupExpiredTokens();

    // 이후 1시간마다 실행
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredTokens();
    }, this.CLEANUP_INTERVAL_MS);

    this.logger.log('Token cleanup service initialized (runs every 1 hour)');
  }

  onModuleDestroy() {
    // 서버 종료 시 타이머 정리 (리소스 누수 방지)
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
      this.logger.log('Token cleanup service stopped');
    }
  }

  /**
   * 만료된 RefreshToken 및 TokenBlacklist 삭제
   */
  async cleanupExpiredTokens(): Promise<void> {
    try {
      // 1. RefreshToken 정리
      const refreshResult = await this.prisma.refreshToken.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: new Date() } }, // 만료된 토큰
            { revokedAt: { not: null } }, // 이미 취소된 토큰
          ],
        },
      });

      // 2. TokenBlacklist 정리 (만료된 블랙리스트 항목 삭제)
      const blacklistResult = await this.prisma.tokenBlacklist.deleteMany({
        where: {
          expiresAt: { lt: new Date() }, // 만료된 블랙리스트 항목
        },
      });

      if (refreshResult.count > 0 || blacklistResult.count > 0) {
        this.logger.log(
          `Cleaned up ${refreshResult.count} expired/revoked refresh tokens, ${blacklistResult.count} expired blacklist entries`,
        );
      }
    } catch (error) {
      this.logger.error('Failed to cleanup expired tokens', error);
    }
  }
}
