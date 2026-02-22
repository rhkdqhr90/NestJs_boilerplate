import { utilities as nestWinstonModuleUtilities } from 'nest-winston';
import * as winston from 'winston';
import 'winston-daily-rotate-file';

// 일일 로그 로테이션 설정
const dailyRotateFileTransport = new winston.transports.DailyRotateFile({
  filename: 'logs/application-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true, // 오래된 로그 압축
  maxSize: '20m', // 파일당 최대 20MB
  maxFiles: '14d', // 14일간 보관
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
  ),
});

const errorRotateFileTransport = new winston.transports.DailyRotateFile({
  filename: 'logs/error-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '30d', // 에러 로그는 30일간 보관
  level: 'error',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
  ),
});

export const winstonConfig = {
  transports: [
    // 콘솔 출력 (개발 환경에서 디버그, 프로덕션에서 info 레벨)
    new winston.transports.Console({
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.ms(),
        nestWinstonModuleUtilities.format.nestLike('NestJS', {
          colors: true,
          prettyPrint: true,
        }),
      ),
    }),
    // 일일 로테이션 로그 파일
    dailyRotateFileTransport,
    // 에러 전용 로테이션 로그 파일
    errorRotateFileTransport,
  ],
};
