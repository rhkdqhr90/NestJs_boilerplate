import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-kakao';
import { ConfigService } from '@nestjs/config';
import { OAuthUserDto } from '../dto/oauth-user.dto';

@Injectable()
export class KakaoStrategy extends PassportStrategy(Strategy, 'kakao') {
  constructor(private configService: ConfigService) {
    super({
      clientID: configService.getOrThrow<string>('KAKAO_CLIENT_ID'),
      clientSecret: configService.getOrThrow<string>('KAKAO_CLIENT_SECRET'),
      callbackURL: configService.getOrThrow<string>('KAKAO_CALLBACK_URL'),
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: (error: any, user?: any) => void,
  ): Promise<void> {
    const { id, _json } = profile;
    const kakaoAccount = _json?.kakao_account;
    const properties = _json?.properties;

    const user: OAuthUserDto = {
      provider: 'kakao',
      providerId: id.toString(),
      email: kakaoAccount?.email || '',
      nickname: properties?.nickname || kakaoAccount?.profile?.nickname || '',
      profileImage: properties?.profile_image || kakaoAccount?.profile?.profile_image_url,
    };

    done(null, user);
  }
}
