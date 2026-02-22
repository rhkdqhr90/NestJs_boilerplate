import { Injectable, NestMiddleware, ForbiddenException, Inject } from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import type { Request, Response, NextFunction } from 'express';

/**
 * CSRF 보호 미들웨어
 * - Origin/Referer 헤더 검증
 * - 안전한 HTTP 메서드(GET, HEAD, OPTIONS)는 검증 제외
 * - SameSite Cookie와 함께 사용하여 이중 보호
 */
@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  private allowedOrigins: string[];

  constructor(
    private configService: ConfigService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {
    // CORS origins 설정에서 허용된 origin 가져오기
    const corsOrigins = this.configService.get('cors.origins') || [];
    this.allowedOrigins = Array.isArray(corsOrigins) ? corsOrigins : [corsOrigins];
  }

  use(req: Request, _res: Response, next: NextFunction) {
    // 안전한 HTTP 메서드는 검증 제외 (GET, HEAD, OPTIONS)
    const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
    if (safeMethods.includes(req.method.toUpperCase())) {
      return next();
    }

    // Origin 또는 Referer 헤더 확인
    const originHeader = req.headers.origin;
    const referer = req.headers.referer;

    // Origin 헤더가 있으면 Origin으로 검증 (배열인 경우 첫 번째 값 사용)
    const origin = Array.isArray(originHeader) ? originHeader[0] : originHeader;
    if (origin) {
      if (this.isAllowedOrigin(origin)) {
        return next();
      }
      throw new ForbiddenException('Invalid origin');
    }

    // Origin이 없으면 Referer로 검증 (일부 브라우저/요청에서 Origin 대신 Referer 사용)
    if (referer) {
      try {
        const refererOrigin = new URL(referer).origin;
        if (this.isAllowedOrigin(refererOrigin)) {
          return next();
        }
      } catch {
        // 잘못된 URL 형식
      }
      throw new ForbiddenException('Invalid referer');
    }

    // 개발 환경에서는 localhost 요청만 허용 (Postman 등 테스트 도구)
    // 보안: 개발 환경에서도 CSRF 검증 유지하되, localhost는 허용
    if (process.env.NODE_ENV === 'development') {
      const host = req.headers.host;
      const isLocalhost =
        host?.startsWith('localhost:') ||
        host?.startsWith('127.0.0.1:') ||
        host === 'localhost' ||
        host === '127.0.0.1';
      if (isLocalhost) {
        return next();
      }
    }

    // Origin과 Referer 둘 다 없으면 거부
    throw new ForbiddenException('Missing origin header');
  }

  private isAllowedOrigin(origin: string): boolean {
    return this.allowedOrigins.some((allowed) => {
      // 보안: 프로덕션에서 '*' 와일드카드 사용 금지
      if (allowed === '*') {
        if (process.env.NODE_ENV === 'production') {
          this.logger.warn('Wildcard origin "*" is not allowed in production', 'CsrfMiddleware');
          return false;
        }
        return true;
      }
      if (allowed === origin) return true;
      // 서브도메인 와일드카드 패턴 지원 (예: *.example.com)
      if (allowed.startsWith('*.')) {
        const domain = allowed.slice(2);
        try {
          const originHostname = new URL(origin).hostname;
          return originHostname.endsWith('.' + domain) || originHostname === domain;
        } catch {
          return false;
        }
      }
      return false;
    });
  }
}
