import { Module, MiddlewareConsumer, NestModule, RequestMethod } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import configuration from './config/configuration';
import { validationSchema } from './config/validation.schema';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { WinstonModule } from 'nest-winston';
import { winstonConfig } from './config/winston.config';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { APP_INTERCEPTOR, APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PostsModule } from './posts/posts.module';
import { CommentsModule } from './comments/comments.module';
import { NotificationsModule } from './notifications/notifications.module';
import { UploadsModule } from './uploads/uploads.module';
import { ReportsModule } from './reports/reports.module';
import { AdminModule } from './admin/admin.module';
import { AnswersModule } from './answers/answers.module';
import { ApplicationsModule } from './applications/applications.module';
import { VerificationsModule } from './verifications/verifications.module';
import { InquiriesModule } from './inquiries/inquiries.module';
import { AnnouncementsModule } from './announcements/announcements.module';
import { BannersModule } from './banners/banners.module';
import { CsrfMiddleware } from './common/middleware/csrf.middleware';

@Module({
  imports: [
    // 스케줄링 (Cron Jobs)
    ScheduleModule.forRoot(),
    // 로그 추가
    WinstonModule.forRoot(winstonConfig),
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema,
      validationOptions: {
        abortEarly: false,
      },
    }),
    // 데이터베이스 (Global - 모든 모듈에서 PrismaService 사용 가능)
    DatabaseModule,
    // Redis (Global - OAuth 캐시, 세션 등)
    RedisModule,
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          // 기본 Rate Limit: 분당 300회 (일반 읽기 API)
          name: 'default',
          ttl: (config.get<number>('throttle.ttl') || 60) * 1000,
          limit: config.get<number>('throttle.limit') || 300,
        },
        {
          // 엄격한 Rate Limit: 15분당 30회 (로그인, 회원가입, 비밀번호 재설정 등)
          name: 'strict',
          ttl: 15 * 60 * 1000, // 15분
          limit: 30,
        },
        {
          // 중간 Rate Limit: 분당 60회 (게시글 작성, 댓글 작성 등 쓰기 작업)
          name: 'medium',
          ttl: 60 * 1000, // 1분
          limit: 60,
        },
      ],
    }),
    AuthModule,
    UsersModule,
    PostsModule,
    CommentsModule,
    NotificationsModule,
    UploadsModule,
    ReportsModule,
    AdminModule,
    AnswersModule,
    ApplicationsModule,
    VerificationsModule,
    InquiriesModule,
    AnnouncementsModule,
    BannersModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // CSRF 미들웨어를 POST, PUT, PATCH, DELETE 요청에 적용
    consumer
      .apply(CsrfMiddleware)
      .forRoutes(
        { path: '*', method: RequestMethod.POST },
        { path: '*', method: RequestMethod.PUT },
        { path: '*', method: RequestMethod.PATCH },
        { path: '*', method: RequestMethod.DELETE },
      );
  }
}
