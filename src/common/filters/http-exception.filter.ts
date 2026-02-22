import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface HttpExceptionResponse {
  message: string | string[];
  error?: string;
  statusCode?: number;
  errors?: Record<string, unknown>;
}

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly isProduction = process.env.NODE_ENV === 'production';

  catch(exception: HttpException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    let message: string | string[] = 'An error occurred';
    let errors: Record<string, unknown> | undefined;

    if (typeof exceptionResponse === 'string') {
      message = exceptionResponse;
    } else if (
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null
    ) {
      const responseObj = exceptionResponse as HttpExceptionResponse;
      if (responseObj.message) {
        message = responseObj.message;
      }
      // 프로덕션에서는 상세 오류 정보 숨김
      if (responseObj.errors && !this.isProduction) {
        errors = responseObj.errors;
      }
    }

    // 응답 구성 (프로덕션에서 path/method 숨김)
    const errorResponse: Record<string, unknown> = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      message,
    };

    // 개발 환경에서만 추가 정보 포함
    if (!this.isProduction) {
      errorResponse.path = request.url;
      errorResponse.method = request.method;
      if (errors) {
        errorResponse.errors = errors;
      }
    }

    response.status(status).json(errorResponse);
  }
}
