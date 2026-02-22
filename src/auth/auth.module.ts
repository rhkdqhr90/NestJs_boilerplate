import { Module, Provider } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { RefreshStrategy } from './strategies/refresh.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { KakaoStrategy } from './strategies/kakao.strategy';
import { NaverStrategy } from './strategies/naver.strategy';
import { TokenCleanupService } from './token-cleanup.service';
import { MailModule } from '../mail/mail.module';
import jwtConfig from '../config/jwt.config';

// OAuth 전략 조건부 등록 (환경변수가 없으면 로드하지 않음)
const oauthProviders: Provider[] = [];

if (process.env.GOOGLE_CLIENT_ID) {
  oauthProviders.push(GoogleStrategy);
}
if (process.env.KAKAO_CLIENT_ID) {
  oauthProviders.push(KakaoStrategy);
}
if (process.env.NAVER_CLIENT_ID) {
  oauthProviders.push(NaverStrategy);
}

@Module({
  imports: [
    ConfigModule.forFeature(jwtConfig),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('jwt.secret'),
        signOptions: {
          expiresIn: configService.get('jwt.expiresIn') || '15m',
        },
      }),
      inject: [ConfigService],
    }),
    MailModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    RefreshStrategy,
    ...oauthProviders,
    TokenCleanupService,
  ],
  exports: [JwtStrategy, PassportModule, AuthService],
})
export class AuthModule {}
