import { ArgumentsHost, Catch, HttpStatus, Logger } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Database error';

    // 보안: 프로덕션에서는 DB 스키마 정보 노출 방지
    const isProduction = process.env.NODE_ENV === 'production';

    switch (exception.code) {
      case 'P2002':
        status = HttpStatus.CONFLICT;
        // 프로덕션: 일반 메시지, 개발: 상세 메시지
        message = isProduction
          ? 'Resource already exists'
          : `Unique constraint failed on ${exception.meta?.target}`;
        break;
      case 'P2025':
        status = HttpStatus.NOT_FOUND;
        message = 'Resource not found';
        break;
      case 'P2003':
        status = HttpStatus.BAD_REQUEST;
        message = isProduction
          ? 'Invalid reference'
          : 'Foreign key constraint failed';
        break;
      default:
        // 개발 환경에서만 상세 에러 표시
        message = isProduction ? 'Database error' : exception.message;
    }

    // 서버 로그에는 상세 정보 기록 (모니터링용)
    this.logger.error(
      `Prisma Error [${exception.code}]: ${exception.message}`,
      exception.stack,
    );

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      ...(isProduction ? {} : { path: request.url, method: request.method }),
      message,
    });
  }
}
