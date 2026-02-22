import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('jwt.secret'),
      passReqToCallback: true, // payload의 iat를 확인하기 위해
    });
  }

  async validate(req: Request, payload: JwtPayload): Promise<JwtPayload> {
    if (!payload.sub || !Object.values(UserRole).includes(payload.role as UserRole)) {
      throw new UnauthorizedException('유효하지 않은 토큰입니다');
    }

    // 토큰 블랙리스트 확인: 사용자의 토큰이 발급 시점 이후에 무효화되었는지 확인
    const tokenIssuedAt = new Date((payload.iat || 0) * 1000);

    const blacklistEntry = await this.prisma.tokenBlacklist.findFirst({
      where: {
        userId: payload.sub,
        revokedAt: {
          gte: tokenIssuedAt, // 토큰 발급 시점 이후에 블랙리스트에 추가됨
        },
        expiresAt: {
          gt: new Date(), // 아직 만료되지 않은 블랙리스트 항목
        },
      },
    });

    if (blacklistEntry) {
      throw new UnauthorizedException(
        '인증이 만료되었습니다. 다시 로그인해주세요.',
      );
    }

    // 정지된 사용자 즉시 차단: 토큰 블랙리스트는 15분 갭이 있으므로 직접 확인
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { isBanned: true, bannedUntil: true },
    });

    if (user?.isBanned) {
      // 정지 해제 시간이 아직 안 지났으면 차단
      if (!user.bannedUntil || user.bannedUntil > new Date()) {
        throw new UnauthorizedException(
          '계정이 정지되었습니다. 관리자에게 문의하세요.',
        );
      }
    }

    return {
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
    };
  }
}
