export interface OAuthUserDto {
  provider: 'google' | 'kakao' | 'naver';
  providerId: string;
  email: string;
  nickname: string;
  profileImage?: string;
}
