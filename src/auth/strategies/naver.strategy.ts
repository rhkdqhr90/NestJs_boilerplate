import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-naver-v2';
import { ConfigService } from '@nestjs/config';
import { OAuthUserDto } from '../dto/oauth-user.dto';

// Naver 전략을 위한 베이스 클래스
const NaverStrategyBase = PassportStrategy(Strategy, 'naver');

@Injectable()
export class NaverStrategy extends NaverStrategyBase {
  constructor(private configService: ConfigService) {
    super({
      clientID: configService.getOrThrow<string>('NAVER_CLIENT_ID'),
      clientSecret: configService.getOrThrow<string>('NAVER_CLIENT_SECRET'),
      callbackURL: configService.getOrThrow<string>('NAVER_CALLBACK_URL'),
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: (error: any, user?: any) => void,
  ): Promise<void> {
    const { id, email, nickname, profileImage } = profile;

    const user: OAuthUserDto = {
      provider: 'naver',
      providerId: id,
      email: email || '',
      nickname: nickname || '',
      profileImage: profileImage,
    };

    done(null, user);
  }
}
