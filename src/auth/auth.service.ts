import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { TokenDto } from './dto/token.dto';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  private readonly SALT_ROUNDS = 10;
  private readonly REFRESH_TOKEN_EXPIRY_DAYS = 7;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  // ========================================
  // Local Authentication (Email/Password)
  // ========================================

  async register(registerDto: RegisterDto): Promise<TokenDto> {
    // 이메일 중복 확인
    const existingUser = await this.prisma.user.findUnique({
      where: { email: registerDto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    // 비밀번호 해싱
    const hashedPassword = await this.hashPassword(registerDto.password);

    // 사용자 생성 (Local 전략)
    const user = await this.prisma.user.create({
      data: {
        email: registerDto.email,
        password: hashedPassword,
        nickname: registerDto.nickname,
        provider: 'local', // 명시적 설정
      },
    });

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
  // OAuth2 Authentication (Phase 2)
  // ========================================

  // TODO: Phase 2 - Google OAuth
  // async googleLogin(googleUser: GoogleUserDto): Promise<TokenDto> {
  //   const user = await this.findOrCreateOAuthUser({
  //     email: googleUser.email,
  //     nickname: googleUser.name,
  //     provider: 'google',
  //     providerId: googleUser.id,
  //   });
  //   return this.generateAndSaveTokens(user.id, user.email, user.role);
  // }

  // TODO: Phase 2 - GitHub OAuth
  // async githubLogin(githubUser: GitHubUserDto): Promise<TokenDto> {
  //   const user = await this.findOrCreateOAuthUser({
  //     email: githubUser.email,
  //     nickname: githubUser.login,
  //     provider: 'github',
  //     providerId: githubUser.id.toString(),
  //   });
  //   return this.generateAndSaveTokens(user.id, user.email, user.role);
  // }

  // TODO: Phase 2 - OAuth User 찾기 또는 생성
  // private async findOrCreateOAuthUser(data: {
  //   email: string;
  //   nickname: string;
  //   provider: string;
  //   providerId: string;
  // }) {
  //   // 1. provider + providerId로 찾기
  //   let user = await this.prisma.user.findUnique({
  //     where: {
  //       provider_providerId: {
  //         provider: data.provider,
  //         providerId: data.providerId,
  //       },
  //     },
  //   });
  //
  //   // 2. 없으면 생성
  //   if (!user) {
  //     user = await this.prisma.user.create({
  //       data: {
  //         email: data.email,
  //         nickname: data.nickname,
  //         provider: data.provider,
  //         providerId: data.providerId,
  //         password: null, // OAuth는 비밀번호 없음
  //       },
  //     });
  //   }
  //
  //   return user;
  // }

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
      throw new UnauthorizedException('Invalid refresh token');
    }

    // 2. revoke 확인
    if (storedToken.revokedAt) {
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    // 3. 만료 확인
    if (storedToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token has expired');
    }

    // 4. userId 일치 확인
    if (storedToken.userId !== userId) {
      throw new UnauthorizedException('Token user mismatch');
    }

    // 5. 기존 토큰 revoke (Token Rotation)
    await this.prisma.refreshToken.update({
      where: { tokenHash },
      data: { revokedAt: new Date() },
    });

    // 6. 새 토큰 생성 및 DB 저장
    const { user } = storedToken;
    return this.generateAndSaveTokens(user.id, user.email, user.role);
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);

    // DB에서 토큰 revoke
    await this.prisma.refreshToken.updateMany({
      where: {
        tokenHash,
        revokedAt: null, // 아직 revoke 안 된 것만
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  // ========================================
  // Private Helper Methods
  // ========================================

  private async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // OAuth 사용자는 비밀번호 로그인 불가
    if (!user.password) {
      throw new UnauthorizedException(
        'This account uses social login. Please use the original login method.',
      );
    }

    const isPasswordValid = await this.comparePassword(password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return user;
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
}
