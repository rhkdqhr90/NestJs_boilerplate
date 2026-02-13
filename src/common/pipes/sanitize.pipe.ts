import { PipeTransform, Injectable } from '@nestjs/common';
import sanitizeHtml from 'sanitize-html';

/**
 * XSS 방어: HTML/스크립트 제거
 */
@Injectable()
export class SanitizePipe implements PipeTransform {
  transform(value: any) {
    if (typeof value === 'object' && value !== null) {
      return this.sanitizeObject(value);
    }
    if (typeof value === 'string') {
      return this.sanitizeString(value);
    }
    return value;
  }

  private sanitizeString(text: string): string {
    return sanitizeHtml(text, {
      allowedTags: [], // 모든 HTML 태그 제거
      allowedAttributes: {},
      disallowedTagsMode: 'discard', // ✅ 태그 완전 제거 (이스케이프 X)
    });
  }

  private sanitizeObject(obj: any): any {
    const sanitized = { ...obj };
    for (const key in sanitized) {
      if (typeof sanitized[key] === 'string') {
        sanitized[key] = this.sanitizeString(sanitized[key]);
      } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
        sanitized[key] = this.sanitizeObject(sanitized[key]);
      }
    }
    return sanitized;
  }
}
