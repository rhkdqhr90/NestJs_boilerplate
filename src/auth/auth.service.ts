import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';
import { MailService } from '../mail/mail.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { TokenDto } from './dto/token.dto';
import { OAuthUserDto } from './dto/oauth-user.dto';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  private readonly SALT_ROUNDS = 10;
  private readonly REFRESH_TOKEN_EXPIRY_DAYS = 7;
  private readonly PASSWORD_RESET_EXPIRY_HOURS = 1;
  private readonly EMAIL_VERIFICATION_EXPIRY_MINUTES = 10; // 6자리 코드는 10분 유효
  private readonly OAUTH_CODE_EXPIRY_SECONDS = 60; // OAuth 임시 코드 1분 유효
  private readonly OAUTH_CODE_PREFIX = 'oauth:code:';

  // Fallback: Redis 연결 실패 시 메모리 캐시 사용
  private readonly MAX_OAUTH_CODES = 1000;
  private oauthCodeFallback = new Map<
    string,
    { accessToken: string; expiresAt: number }
  >();

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private mailService: MailService,
    private redisService: RedisService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {}

  // ========================================
  // Local Authentication (Email/Password)
  // ========================================

  async register(registerDto: RegisterDto): Promise<TokenDto> {
    // 약관 동의 검증 (필수)
    if (!registerDto.agreedTerms || !registerDto.agreedPrivacy) {
      throw new BadRequestException(
        '이용약관과 개인정보처리방침에 동의해주세요.',
      );
    }

    // 이메일 중복 확인 - Email Enumeration 방지를 위해 일반적인 메시지 사용
    const existingUser = await this.prisma.user.findUnique({
      where: { email: registerDto.email },
    });

    if (existingUser) {
      // 보안: 이메일 존재 여부를 노출하지 않는 일반 메시지
      throw new ConflictException(
        '회원가입에 실패했습니다. 다시 시도하거나 다른 이메일을 사용해주세요.',
      );
    }

    // 비밀번호 해싱
    const hashedPassword = await this.hashPassword(registerDto.password);

    // 약관 동의 일시 기록
    const now = new Date();

    // 사용자 생성 (Local 전략, isVerified = false)
    const user = await this.prisma.user.create({
      data: {
        email: registerDto.email,
        password: hashedPassword,
        nickname: registerDto.nickname,
        provider: 'local', // 명시적 설정
        jobType: registerDto.jobType, // 교사쉼터: 직종
        career: registerDto.career, // 교사쉼터: 경력
        isVerified: false, // 이메일 인증 전
        termsAgreedAt: now, // 이용약관 동의 일시
        privacyAgreedAt: now, // 개인정보처리방침 동의 일시
      },
    });

    // 이메일 인증 토큰 생성 및 발송 (실패해도 회원가입은 완료, 재발송 가능)
    try {
      await this.sendVerificationEmail(user.id, user.email, user.nickname);
    } catch (error) {
      // 이메일 발송 실패는 로깅만 하고 회원가입은 진행
      // 사용자는 로그인 후 재발송 가능
      this.logger.error(
        'Failed to send verification email',
        error,
        'AuthService',
      );
    }

    // 토큰 생성 및 DB 저장
    return this.generateAndSaveTokens(user.id, user.email, user.role);
  }

  async login(loginDto: LoginDto): Promise<TokenDto> {
    // 사용자 검증
    const user = await this.validateUser(loginDto.email, loginDto.password);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // 토큰 생성 및 DB 저장
    return this.generateAndSaveTokens(user.id, user.email, user.role);
  }

  // ========================================
  // OAuth2 Authentication
  // ========================================

  /**
   * OAuth 로그인 처리 (Google, Kakao, Naver)
   */
  async oauthLogin(oauthUser: OAuthUserDto): Promise<TokenDto> {
    const user = await this.findOrCreateOAuthUser(oauthUser);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return this.generateAndSaveTokens(user.id, user.email, user.role);
  }

  /**
   * OAuth 사용자 찾기 또는 생성
   * 정책:
   * 1. provider + providerId 매칭 → 기존 OAuth 사용자
   * 2. 같은 이메일 로컬 계정 → 계정 연결 (provider 업데이트)
   * 3. 같은 이메일 다른 OAuth → 에러
   * 4. 신규 이메일 → 새 계정 생성
   */
  private async findOrCreateOAuthUser(data: OAuthUserDto) {
    // 1. provider + providerId로 기존 OAuth 사용자 찾기
    let user = await this.prisma.user.findUnique({
      where: {
        provider_providerId: {
          provider: data.provider,
          providerId: data.providerId,
        },
      },
    });

    if (user) {
      return user;
    }

    // 2. 동일 이메일의 기존 사용자 확인
    const existingUser = await this.prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      // 기존 계정이 있는 경우: 자동 연결하지 않고 에러 반환 (보안 강화)
      // 로컬 계정이든 다른 OAuth 계정이든 동일하게 처리
      const providerName =
        existingUser.provider === 'local'
          ? '이메일/비밀번호'
          : existingUser.provider === 'google'
            ? '구글'
            : existingUser.provider === 'kakao'
              ? '카카오'
              : existingUser.provider === 'naver'
                ? '네이버'
                : existingUser.provider;
      throw new ConflictException(
        `이미 ${providerName}로 가입된 이메일입니다. 해당 방식으로 로그인해주세요.`,
      );
    }

    // 3. 신규 사용자 생성
    const now = new Date();
    user = await this.prisma.user.create({
      data: {
        email: data.email,
        nickname: data.nickname,
        provider: data.provider,
        providerId: data.providerId,
        profileImage: data.profileImage,
        password: null, // OAuth는 비밀번호 없음
        isVerified: true, // OAuth는 이메일 인증 완료로 처리
        termsAgreedAt: now, // OAuth 가입 시 약관 동의 기록
        privacyAgreedAt: now, // 개인정보처리방침 동의 기록
      },
    });

    return user;
  }

  // ========================================
  // Token Management
  // ========================================

  async refresh(userId: string, oldRefreshToken: string): Promise<TokenDto> {
    // 1. 기존 토큰 검증 및 가져오기
    const tokenHash = this.hashToken(oldRefreshToken);
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!storedToken) {
      throw new UnauthorizedException('유효하지 않은 토큰입니다');
    }

    // 2. revoke 확인
    if (storedToken.revokedAt) {
      throw new UnauthorizedException('토큰이 무효화되었습니다');
    }

    // 3. 만료 확인
    if (storedToken.expiresAt < new Date()) {
      throw new UnauthorizedException('토큰이 만료되었습니다');
    }

    // 4. userId 일치 확인
    if (storedToken.userId !== userId) {
      throw new UnauthorizedException('사용자 정보가 일치하지 않습니다');
    }

    // 5. 트랜잭션: 기존 토큰 revoke + 새 토큰 생성 (Race Condition 방지)
    const { user } = storedToken;
    const payload = { sub: user.id, email: user.email, role: user.role };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.getOrThrow<string>('jwt.secret'),
        expiresIn: this.configService.get('jwt.expiresIn') || '15m',
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.getOrThrow<string>('jwt.refreshSecret'),
        expiresIn:
          this.configService.get('jwt.refreshExpiresIn') ||
          `${this.REFRESH_TOKEN_EXPIRY_DAYS}d`,
      }),
    ]);

    const newExpiresAt = new Date();
    newExpiresAt.setDate(
      newExpiresAt.getDate() + this.REFRESH_TOKEN_EXPIRY_DAYS,
    );

    await this.prisma.$transaction([
      // 기존 토큰 revoke
      this.prisma.refreshToken.update({
        where: { tokenHash },
        data: { revokedAt: new Date() },
      }),
      // 새 토큰 저장
      this.prisma.refreshToken.create({
        data: {
          tokenHash: this.hashToken(refreshToken),
          userId: user.id,
          expiresAt: newExpiresAt,
        },
      }),
    ]);

    return { accessToken, refreshToken };
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);

    // 1. DB에서 refreshToken 조회하여 userId를 신뢰할 수 있게 추출
    //    (서명 미검증 JWT에서 userId를 추출하면 공격자가 임의의 userId를 블랙리스트에 올릴 수 있음)
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: { userId: true, revokedAt: true },
    });

    // 토큰이 없거나 이미 무효화된 경우 (정상 로그아웃: 쿠키만 삭제)
    if (!storedToken || storedToken.revokedAt) {
      return;
    }

    const userId = storedToken.userId;

    // 2. 트랜잭션: refreshToken revoke + accessToken 블랙리스트 추가
    await this.prisma.$transaction([
      this.prisma.refreshToken.update({
        where: { tokenHash },
        data: { revokedAt: new Date() },
      }),
      this.prisma.tokenBlacklist.create({
        data: {
          userId,
          expiresAt: this.calculateAccessTokenExpiry(),
          revokedAt: new Date(),
        },
      }),
    ]);
  }

  /**
   * refreshToken 없이 accessToken만 있는 경우의 블랙리스트 처리
   * accessToken을 서명 검증(verify)하여 userId를 안전하게 추출
   */
  async blacklistFromAccessToken(
    authHeader: string | undefined,
  ): Promise<void> {
    if (!authHeader?.startsWith('Bearer ')) return;

    try {
      const token = authHeader.substring(7);
      // 서명 검증 (verify) — decode와 달리 조작 불가
      const payload = await this.jwtService.verifyAsync<{
        sub: string;
      }>(token, {
        secret: this.configService.getOrThrow<string>('jwt.secret'),
      });

      if (!payload.sub) return;

      await this.prisma.tokenBlacklist.create({
        data: {
          userId: payload.sub,
          expiresAt: this.calculateAccessTokenExpiry(),
          revokedAt: new Date(),
        },
      });
    } catch {
      // 토큰이 이미 만료/무효인 경우 — 블랙리스트 불필요
    }
  }

  /**
   * accessToken 만료 시간 계산 (블랙리스트 TTL용)
   */
  private calculateAccessTokenExpiry(): Date {
    const expiry = new Date();
    const expiresIn = this.configService.get<string>('jwt.expiresIn') || '15m';
    const match = expiresIn.match(/^(\d+)([mhd])$/);
    if (match) {
      const value = parseInt(match[1], 10);
      const unit = match[2];
      if (unit === 'm') expiry.setMinutes(expiry.getMinutes() + value);
      else if (unit === 'h') expiry.setHours(expiry.getHours() + value);
      else if (unit === 'd') expiry.setDate(expiry.getDate() + value);
    } else {
      expiry.setMinutes(expiry.getMinutes() + 15);
    }
    return expiry;
  }

  // ========================================
  // Email Verification
  // ========================================

  /**
   * 6자리 인증 코드 생성
   */
  private generateVerificationCode(): string {
    // 보안을 위해 crypto 사용 (Math.random보다 안전)
    const randomBytes = crypto.randomBytes(3); // 3바이트 = 최대 16,777,215
    const code = (parseInt(randomBytes.toString('hex'), 16) % 900000) + 100000;
    return code.toString();
  }

  /**
   * 이메일 인증 코드 생성 및 발송
   */
  async sendVerificationEmail(
    userId: string,
    email: string,
    nickname: string,
  ): Promise<void> {
    // 기존 미사용 토큰 무효화
    await this.prisma.emailVerificationToken.updateMany({
      where: {
        userId,
        verifiedAt: null,
      },
      data: {
        verifiedAt: new Date(),
      },
    });

    // 6자리 인증 코드 생성
    const code = this.generateVerificationCode();
    const tokenHash = this.hashToken(code);
    const expiresAt = new Date();
    expiresAt.setMinutes(
      expiresAt.getMinutes() + this.EMAIL_VERIFICATION_EXPIRY_MINUTES,
    );

    // DB에 코드 해시 저장
    await this.prisma.emailVerificationToken.create({
      data: {
        tokenHash,
        userId,
        expiresAt,
      },
    });

    // 이메일 발송
    await this.mailService.sendEmailVerificationCode(email, code, nickname);

    // 개발 환경에서는 콘솔에만 출력 (API 응답에 코드 노출하지 않음 - 보안)
    if (process.env.NODE_ENV === 'development') {
      this.logger.log(
        `[DEV] Email verification code for ${email}: ${code}`,
        'AuthService',
      );
    }
  }

  /**
   * 이메일 인증 코드 확인 (브루트포스 방지: 최대 5회 시도)
   */
  async verifyEmail(
    userId: string,
    code: string,
  ): Promise<{ message: string }> {
    // 6자리 숫자 코드 검증
    if (!/^\d{6}$/.test(code)) {
      throw new BadRequestException('6자리 숫자 코드를 입력해주세요');
    }

    // 해당 사용자의 가장 최근 유효한 인증 토큰 조회
    const latestToken = await this.prisma.emailVerificationToken.findFirst({
      where: {
        userId,
        verifiedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      include: { user: true },
    });

    if (!latestToken) {
      throw new BadRequestException(
        '유효한 인증 코드가 없습니다. 인증 코드를 다시 요청해주세요.',
      );
    }

    // 최대 시도 횟수 초과 확인
    if (latestToken.attempts >= latestToken.maxAttempts) {
      // 코드 무효화
      await this.prisma.emailVerificationToken.update({
        where: { id: latestToken.id },
        data: { verifiedAt: new Date() },
      });
      throw new BadRequestException(
        '인증 시도 횟수를 초과했습니다. 인증 코드를 다시 요청해주세요.',
      );
    }

    // 시도 횟수 증가
    await this.prisma.emailVerificationToken.update({
      where: { id: latestToken.id },
      data: { attempts: { increment: 1 } },
    });

    // 코드 해시 비교
    const tokenHash = this.hashToken(code);
    if (latestToken.tokenHash !== tokenHash) {
      const remainingAttempts =
        latestToken.maxAttempts - latestToken.attempts - 1;
      if (remainingAttempts <= 0) {
        // 마지막 시도 실패 - 코드 무효화
        await this.prisma.emailVerificationToken.update({
          where: { id: latestToken.id },
          data: { verifiedAt: new Date() },
        });
        throw new BadRequestException(
          '인증 시도 횟수를 초과했습니다. 인증 코드를 다시 요청해주세요.',
        );
      }
      throw new BadRequestException(
        `잘못된 인증 코드입니다 (남은 시도: ${remainingAttempts}회)`,
      );
    }

    // 이미 인증된 사용자
    if (latestToken.user.isVerified) {
      return { message: '이미 인증된 계정입니다' };
    }

    // 트랜잭션으로 사용자 인증 + 코드 사용 처리
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: latestToken.userId },
        data: { isVerified: true },
      }),
      this.prisma.emailVerificationToken.update({
        where: { id: latestToken.id },
        data: { verifiedAt: new Date() },
      }),
    ]);

    return { message: '이메일 인증이 완료되었습니다' };
  }

  /**
   * 인증 메일 재발송
   */
  async resendVerificationEmail(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new BadRequestException('사용자를 찾을 수 없습니다');
    }

    if (user.isVerified) {
      throw new BadRequestException('이미 인증된 계정입니다');
    }

    await this.sendVerificationEmail(user.id, user.email, user.nickname);
  }

  // ========================================
  // Password Reset
  // ========================================

  /**
   * 비밀번호 찾기 - 이메일로 재설정 링크 발송
   * 보안: 이메일 존재 여부와 관계없이 동일한 응답
   */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    // 사용자가 없어도 동일한 응답 (Email Enumeration 방지)
    if (!user) {
      return;
    }

    // OAuth 사용자는 비밀번호 재설정 불가
    if (!user.password) {
      return;
    }

    // 기존 미사용 토큰 무효화
    await this.prisma.passwordResetToken.updateMany({
      where: {
        userId: user.id,
        usedAt: null,
      },
      data: {
        usedAt: new Date(),
      },
    });

    // 새 토큰 생성 (32바이트 = 64자 hex)
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + this.PASSWORD_RESET_EXPIRY_HOURS);

    // DB에 토큰 저장
    await this.prisma.passwordResetToken.create({
      data: {
        tokenHash,
        userId: user.id,
        expiresAt,
      },
    });

    // 이메일 발송
    await this.mailService.sendPasswordResetEmail(
      user.email,
      token,
      user.nickname,
    );
  }

  /**
   * 비밀번호 재설정
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const tokenHash = this.hashToken(token);

    // 토큰 조회
    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!resetToken) {
      throw new BadRequestException('유효하지 않은 토큰입니다');
    }

    // 이미 사용된 토큰
    if (resetToken.usedAt) {
      throw new BadRequestException('이미 사용된 토큰입니다');
    }

    // 만료된 토큰
    if (resetToken.expiresAt < new Date()) {
      throw new BadRequestException('토큰이 만료되었습니다');
    }

    // 비밀번호 해싱
    const hashedPassword = await this.hashPassword(newPassword);

    // 트랜잭션으로 비밀번호 변경 + 토큰 사용 처리 + 세션 무효화
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: resetToken.userId },
        data: { password: hashedPassword },
      }),
      this.prisma.passwordResetToken.update({
        where: { tokenHash },
        data: { usedAt: new Date() },
      }),
      // 모든 RefreshToken 무효화 (보안)
      this.prisma.refreshToken.updateMany({
        where: {
          userId: resetToken.userId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      }),
      // AccessToken 블랙리스트 추가 (기존 토큰 즉시 무효화)
      this.prisma.tokenBlacklist.create({
        data: {
          userId: resetToken.userId,
          expiresAt: this.calculateAccessTokenExpiry(),
          revokedAt: new Date(),
          reason: 'password_reset',
        },
      }),
    ]);
  }

  // ========================================
  // Private Helper Methods
  // ========================================

  /**
   * 사용자 검증 - Timing Attack 방지
   * 사용자 존재 여부와 관계없이 항상 동일한 시간에 응답
   */
  private async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    // Timing Attack 방지: 사용자가 없어도 항상 bcrypt 비교 수행
    // 유효한 bcrypt 해시 형식 (60자)을 사용하여 응답 시간을 일정하게 유지
    // 이 해시는 "dummy"를 해싱한 결과로, 실제 비밀번호와 절대 일치하지 않음
    const dummyHash =
      '$2b$10$N9qo8uLOickgx2ZMRZoMy.MqrqQqPDkq5CzFsKjEqW3NzY6qK1Yxa';
    const passwordToCompare = user?.password || dummyHash;

    const isPasswordValid = await this.comparePassword(
      password,
      passwordToCompare,
    );

    // 사용자가 없거나 비밀번호가 틀린 경우 동일한 에러 반환
    if (!user || !isPasswordValid) {
      throw new UnauthorizedException(
        '이메일 또는 비밀번호가 올바르지 않습니다',
      );
    }

    // OAuth 사용자는 비밀번호 로그인 불가
    if (!user.password) {
      throw new UnauthorizedException(
        '소셜 로그인으로 가입된 계정입니다. 해당 소셜 로그인을 이용해주세요.',
      );
    }

    // 정지된 사용자 체크
    if (user.isBanned) {
      // 정지 해제 시간이 지났는지 확인
      if (user.bannedUntil && user.bannedUntil <= new Date()) {
        // 자동 정지 해제
        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            isBanned: false,
            bannedAt: null,
            bannedUntil: null,
            banReason: null,
          },
        });
      } else {
        // 정지 중
        const banMessage = this.getBanMessage(user.bannedUntil, user.banReason);
        throw new UnauthorizedException(banMessage);
      }
    }

    return user;
  }

  /**
   * 정지 메시지 생성
   */
  private getBanMessage(
    bannedUntil: Date | null,
    banReason: string | null,
  ): string {
    if (!bannedUntil) {
      // 영구 정지
      return `계정이 영구 정지되었습니다.${banReason ? ` 사유: ${banReason}` : ''}`;
    }

    // 정지 해제 시간 확인
    const now = new Date();
    if (bannedUntil <= now) {
      // 이미 정지 해제 시간이 지났지만 아직 해제되지 않음
      // 이 경우는 정상 로그인 허용 (자동 해제 처리)
      return '';
    }

    // 정지 중
    const untilStr = bannedUntil.toLocaleString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    return `계정이 ${untilStr}까지 정지되었습니다.${banReason ? ` 사유: ${banReason}` : ''}`;
  }

  private async generateAndSaveTokens(
    userId: string,
    email: string,
    role: string,
  ): Promise<TokenDto> {
    const payload = { sub: userId, email, role };

    // 1. 토큰 생성
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.getOrThrow<string>('jwt.secret'),
        expiresIn: this.configService.get('jwt.expiresIn') || '15m',
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.getOrThrow<string>('jwt.refreshSecret'),
        expiresIn:
          this.configService.get('jwt.refreshExpiresIn') ||
          `${this.REFRESH_TOKEN_EXPIRY_DAYS}d`,
      }),
    ]);

    // 2. Refresh Token DB 저장
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.REFRESH_TOKEN_EXPIRY_DAYS);

    await this.prisma.refreshToken.create({
      data: {
        tokenHash: this.hashToken(refreshToken),
        userId,
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken,
    };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.SALT_ROUNDS);
  }

  private async comparePassword(
    plainPassword: string,
    hashedPassword: string,
  ): Promise<boolean> {
    return bcrypt.compare(plainPassword, hashedPassword);
  }

  // ========================================
  // OAuth 임시 코드 관리 (보안: URL에 토큰 노출 방지)
  // Redis 사용 (멀티 인스턴스 지원) + 메모리 fallback
  // ========================================

  /**
   * OAuth 임시 코드 생성 (1회용, 1분 만료)
   */
  async generateOAuthCode(accessToken: string): Promise<string> {
    const code = crypto.randomBytes(32).toString('hex');

    if (this.redisService.isConnected()) {
      // Redis에 저장 (자동 TTL 만료)
      await this.redisService.set(
        `${this.OAUTH_CODE_PREFIX}${code}`,
        accessToken,
        this.OAUTH_CODE_EXPIRY_SECONDS,
      );
    } else {
      // Fallback: 메모리 캐시
      this.logger.warn(
        'Redis unavailable, using in-memory OAuth code cache',
        'AuthService',
      );
      this.cleanupExpiredFallbackCodes();

      if (this.oauthCodeFallback.size >= this.MAX_OAUTH_CODES) {
        const entries = Array.from(this.oauthCodeFallback.entries());
        entries.sort((a, b) => a[1].expiresAt - b[1].expiresAt);
        const toDelete = entries.slice(0, Math.floor(this.MAX_OAUTH_CODES / 2));
        toDelete.forEach(([key]) => this.oauthCodeFallback.delete(key));
      }

      this.oauthCodeFallback.set(code, {
        accessToken,
        expiresAt: Date.now() + this.OAUTH_CODE_EXPIRY_SECONDS * 1000,
      });
    }

    return code;
  }

  /**
   * OAuth 임시 코드로 토큰 교환 (1회용)
   */
  async exchangeOAuthCode(code: string): Promise<string> {
    if (this.redisService.isConnected()) {
      const redisKey = `${this.OAUTH_CODE_PREFIX}${code}`;
      const accessToken = await this.redisService.get(redisKey);

      if (!accessToken) {
        throw new BadRequestException('유효하지 않은 코드입니다');
      }

      // 1회용: 사용 후 즉시 삭제
      await this.redisService.del(redisKey);
      return accessToken;
    }

    // Fallback: 메모리 캐시
    const cached = this.oauthCodeFallback.get(code);

    if (!cached) {
      throw new BadRequestException('유효하지 않은 코드입니다');
    }

    if (cached.expiresAt < Date.now()) {
      this.oauthCodeFallback.delete(code);
      throw new BadRequestException('코드가 만료되었습니다');
    }

    // 1회용: 사용 후 즉시 삭제
    this.oauthCodeFallback.delete(code);
    return cached.accessToken;
  }

  /**
   * 만료된 fallback OAuth 코드 정리
   */
  private cleanupExpiredFallbackCodes(): void {
    const now = Date.now();
    for (const [code, data] of this.oauthCodeFallback.entries()) {
      if (data.expiresAt < now) {
        this.oauthCodeFallback.delete(code);
      }
    }
  }
}
