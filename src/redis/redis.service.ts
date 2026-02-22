import {
  Injectable,
  Inject,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {}

  async onModuleInit() {
    try {
      await this.redis.connect();
      this.logger.log('Redis connected', 'RedisService');
    } catch (error) {
      this.logger.error(`Redis connection failed: ${error}`, 'RedisService');
      // Redis 연결 실패 시에도 앱은 기동 (OAuth 캐시는 fallback으로 동작)
    }
  }

  async onModuleDestroy() {
    try {
      await this.redis.quit();
    } catch {
      // 종료 시 에러 무시
    }
  }

  /**
   * Redis 연결 상태 확인
   */
  isConnected(): boolean {
    return this.redis.status === 'ready';
  }

  /**
   * 키-값 저장 (TTL 초 단위)
   */
  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.redis.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.redis.set(key, value);
    }
  }

  /**
   * 키로 값 조회
   */
  async get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  /**
   * 키 삭제
   */
  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  /**
   * 키 존재 여부 확인
   */
  async exists(key: string): Promise<boolean> {
    const result = await this.redis.exists(key);
    return result === 1;
  }

  /**
   * 원본 Redis 클라이언트 접근 (고급 사용)
   */
  getClient(): Redis {
    return this.redis;
  }
}
