import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);
  private readonly isProduction = process.env.NODE_ENV === 'production';

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // 프로덕션에서는 내부 오류 메시지를 숨김 (정보 노출 방지)
    let message: string;
    if (exception instanceof HttpException) {
      message = exception.message;
    } else if (this.isProduction) {
      // 프로덕션: 일반적인 메시지만 반환
      message = '서버 오류가 발생했습니다';
    } else {
      // 개발: 상세 메시지 반환
      message = exception instanceof Error ? exception.message : 'Internal server error';
    }

    // 에러 로깅 (개발/프로덕션 모두)
    if (exception instanceof Error) {
      this.logger.error(
        `${request.method} ${request.url} | Status: ${status} | Error: ${exception.message}`,
        exception.stack,
      );
    } else {
      this.logger.error(
        `${request.method} ${request.url} | Status: ${status} | Unknown error`,
      );
    }

    // 응답 구성 (프로덕션에서 path 숨김)
    const errorResponse: Record<string, unknown> = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      message,
    };

    // 개발 환경에서만 추가 정보 포함
    if (!this.isProduction) {
      errorResponse.path = request.url;
      errorResponse.method = request.method;
    }

    response.status(status).json(errorResponse);
  }
}
