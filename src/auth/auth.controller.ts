import {
  Controller,
  Post,
  Get,
  Body,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
  Inject,
  ConflictException,
} from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import type { Response, Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { OAuthUserDto } from './dto/oauth-user.dto';
import { ExchangeOAuthCodeDto } from './dto/exchange-oauth-code.dto';
import { RefreshAuthGuard } from './guards/refresh-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {}

  @Post('register')
  @ApiOperation({ summary: '회원가입', description: '이메일과 비밀번호로 새 계정을 생성합니다.' })
  @ApiResponse({ status: 201, description: '회원가입 성공, accessToken 반환' })
  @ApiResponse({ status: 400, description: '유효하지 않은 입력' })
  @ApiResponse({ status: 409, description: '이미 존재하는 이메일' })
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ strict: { ttl: 900000, limit: 3 } }) // 15분에 3번 (스팸 방지)
  async register(
    @Body() registerDto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken } =
      await this.authService.register(registerDto);

    // refreshToken을 httpOnly Cookie에 저장
    this.setRefreshTokenCookie(res, refreshToken);

    return { accessToken };
  }

  @Post('login')
  @ApiOperation({ summary: '로그인', description: '이메일과 비밀번호로 로그인합니다.' })
  @ApiResponse({ status: 200, description: '로그인 성공, accessToken 반환' })
  @ApiResponse({ status: 401, description: '잘못된 이메일 또는 비밀번호' })
  @HttpCode(HttpStatus.OK)
  @Throttle({ strict: { ttl: 900000, limit: 5 } }) // 15분에 5번 (브루트포스 방지)
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken } =
      await this.authService.login(loginDto);

    // refreshToken을 httpOnly Cookie에 저장
    this.setRefreshTokenCookie(res, refreshToken);

    return { accessToken };
  }

  @Post('refresh')
  @ApiOperation({ summary: '토큰 갱신', description: 'refreshToken으로 새 accessToken을 발급받습니다.' })
  @ApiResponse({ status: 200, description: '토큰 갱신 성공' })
  @ApiResponse({ status: 401, description: '유효하지 않은 refreshToken' })
  @HttpCode(HttpStatus.OK)
  @UseGuards(RefreshAuthGuard)
  @Throttle({ default: { ttl: 60000, limit: 10 } }) // 1분에 10번
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // RefreshStrategy가 설정한 user 정보
    const user = req.user as {
      id: string;
      email: string;
      refreshToken: string;
    };

    // Token Rotation: 새 토큰 발급
    const { accessToken, refreshToken } = await this.authService.refresh(
      user.id,
      user.refreshToken,
    );

    // 새 refreshToken을 Cookie에 저장
    this.setRefreshTokenCookie(res, refreshToken);

    return { accessToken };
  }

  @Post('logout')
  @ApiOperation({ summary: '로그아웃', description: 'refreshToken을 무효화하고 accessToken을 블랙리스트에 추가합니다.' })
  @ApiResponse({ status: 204, description: '로그아웃 성공' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.refreshToken as string | undefined;

    if (refreshToken) {
      // refreshToken이 있으면 DB에서 revoke + accessToken 블랙리스트 추가
      // userId는 refreshToken의 DB 레코드에서 신뢰할 수 있게 추출
      await this.authService.logout(refreshToken);
    } else {
      // refreshToken이 없어도 accessToken이 유효하면 블랙리스트에 추가
      // (쿠키 만료 후에도 accessToken이 살아있는 경우 대비)
      await this.authService.blacklistFromAccessToken(
        req.headers.authorization,
      );
    }

    // Cookie 삭제
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });
  }

  @Post('forgot-password')
  @ApiOperation({ summary: '비밀번호 찾기', description: '비밀번호 재설정 이메일을 발송합니다.' })
  @ApiResponse({ status: 200, description: '이메일 발송 완료 (존재 여부 무관)' })
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 3 } }) // 1분에 3번 (스팸 방지)
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    await this.authService.forgotPassword(forgotPasswordDto.email);
    // 보안: 이메일 존재 여부와 관계없이 동일한 응답
    return {
      message:
        '이메일이 등록되어 있다면 비밀번호 재설정 링크가 발송됩니다.',
    };
  }

  @Post('reset-password')
  @ApiOperation({ summary: '비밀번호 재설정', description: '토큰으로 비밀번호를 재설정합니다.' })
  @ApiResponse({ status: 200, description: '비밀번호 변경 성공' })
  @ApiResponse({ status: 400, description: '유효하지 않거나 만료된 토큰' })
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 5 } }) // 1분에 5번
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    await this.authService.resetPassword(
      resetPasswordDto.token,
      resetPasswordDto.newPassword,
    );
    return { message: '비밀번호가 성공적으로 변경되었습니다.' };
  }

  @Post('verify-email')
  @ApiOperation({ summary: '이메일 인증', description: '인증 코드로 이메일을 인증합니다.' })
  @ApiResponse({ status: 200, description: '이메일 인증 성공' })
  @ApiResponse({ status: 400, description: '유효하지 않거나 만료된 코드' })
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @Throttle({ strict: { ttl: 900000, limit: 10 } }) // 15분에 10번 (브루트포스 방지)
  async verifyEmail(@Req() req: Request, @Body() verifyEmailDto: VerifyEmailDto) {
    const user = req.user as { sub: string };
    return await this.authService.verifyEmail(user.sub, verifyEmailDto.code);
  }

  @Post('resend-verification')
  @ApiOperation({ summary: '인증 이메일 재발송', description: '이메일 인증 메일을 재발송합니다.' })
  @ApiResponse({ status: 200, description: '이메일 재발송 성공' })
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 300000, limit: 3 } }) // 5분에 3번 (스팸 방지 강화)
  async resendVerificationEmail(@Req() req: Request) {
    const user = req.user as { sub: string };
    await this.authService.resendVerificationEmail(user.sub);
    return { message: '인증 메일이 재발송되었습니다.' };
  }

  // ========================================
  // OAuth2 - Google
  // ========================================

  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleLogin() {
    // Passport가 Google로 리다이렉트
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.handleOAuthCallback(req, res);
  }

  // ========================================
  // OAuth2 - Kakao
  // ========================================

  @Get('kakao')
  @UseGuards(AuthGuard('kakao'))
  kakaoLogin() {
    // Passport가 Kakao로 리다이렉트
  }

  @Get('kakao/callback')
  @UseGuards(AuthGuard('kakao'))
  async kakaoCallback(
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.handleOAuthCallback(req, res);
  }

  // ========================================
  // OAuth2 - Naver
  // ========================================

  @Get('naver')
  @UseGuards(AuthGuard('naver'))
  naverLogin() {
    // Passport가 Naver로 리다이렉트
  }

  @Get('naver/callback')
  @UseGuards(AuthGuard('naver'))
  async naverCallback(
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.handleOAuthCallback(req, res);
  }

  // ========================================
  // OAuth 임시 코드 교환 (보안: URL에 토큰 노출 방지)
  // ========================================

  @Post('oauth/exchange')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async exchangeOAuthCode(
    @Body() dto: ExchangeOAuthCodeDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const accessToken = await this.authService.exchangeOAuthCode(dto.code);
    return { accessToken };
  }

  // ========================================
  // OAuth 공통 콜백 처리
  // ========================================

  // 허용된 리다이렉트 URL 화이트리스트
  private readonly ALLOWED_REDIRECT_ORIGINS = [
    'http://localhost:3001',
    'http://127.0.0.1:3001',
  ];

  /**
   * 리다이렉트 URL 검증 (Open Redirect 방지)
   */
  private validateRedirectUrl(url: string): string {
    try {
      const parsedUrl = new URL(url);
      const origin = parsedUrl.origin;

      // 프로덕션에서는 환경변수에서 허용된 도메인 확인
      const frontendUrl = this.configService.get<string>('FRONTEND_URL');
      const allowedOrigins = [...this.ALLOWED_REDIRECT_ORIGINS];

      if (frontendUrl) {
        try {
          const frontendOrigin = new URL(frontendUrl).origin;
          allowedOrigins.push(frontendOrigin);
        } catch {
          // 잘못된 FRONTEND_URL 무시
        }
      }

      // 화이트리스트 검증
      if (!allowedOrigins.includes(origin)) {
        this.logger.warn(`Blocked redirect to untrusted origin: ${origin}`, 'AuthController');
        // 기본 프론트엔드 URL로 폴백
        return frontendUrl || 'http://localhost:3001';
      }

      return url;
    } catch {
      // URL 파싱 실패 시 기본값
      return this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3001';
    }
  }

  private async handleOAuthCallback(req: Request, res: Response) {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3001';
    // 보안: 리다이렉트 URL 검증
    const safeRedirectBase = this.validateRedirectUrl(frontendUrl);

    try {
      const oauthUser = req.user as OAuthUserDto;
      const { accessToken, refreshToken } = await this.authService.oauthLogin(oauthUser);

      // refreshToken을 httpOnly Cookie에 저장
      this.setRefreshTokenCookie(res, refreshToken);

      // 임시 코드 생성 (1회용, 1분 만료)
      const code = await this.authService.generateOAuthCode(accessToken);

      // 프론트엔드 콜백 페이지로 리다이렉트 (임시 코드만 전달, 토큰 노출 X)
      return res.redirect(`${safeRedirectBase}/login/callback?code=${code}`);
    } catch (error) {
      // 에러 로깅 (내부 상세 메시지는 서버 로그에만)
      this.logger.error(
        `OAuth callback failed: ${error instanceof Error ? error.message : error}`,
        'AuthController',
      );
      // 보안: 사용자에게는 일반적인 에러 코드만 전달 (내부 메시지 노출 방지)
      const errorCode = error instanceof ConflictException ? 'account_exists' : 'login_failed';
      return res.redirect(`${safeRedirectBase}/login/callback?error=${errorCode}`);
    }
  }

  private setRefreshTokenCookie(res: Response, refreshToken: string) {
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // HTTPS only in production
      sameSite: 'lax', // 'lax' allows cookies on top-level navigations (OAuth redirects)
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
  }
}
