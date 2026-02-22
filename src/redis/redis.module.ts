import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RedisService } from './redis.service';
import { REDIS_CLIENT } from './redis.constants';

export { REDIS_CLIENT };

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (configService: ConfigService) => {
        return new Redis({
          host: configService.get('redis.host', 'localhost'),
          port: configService.get('redis.port', 6379),
          password: configService.get('redis.password', undefined),
          db: configService.get('redis.db', 0),
          maxRetriesPerRequest: 3,
          retryStrategy: (times: number) => {
            if (times > 3) return null; // 3회 초과 시 재시도 중단
            return Math.min(times * 200, 2000); // 점진적 대기
          },
          lazyConnect: true, // 명시적 connect() 호출 시 연결
        });
      },
      inject: [ConfigService],
    },
    RedisService,
  ],
  exports: [REDIS_CLIENT, RedisService],
})
export class RedisModule {}
