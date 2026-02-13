import { TransformFnParams } from 'class-transformer';
import sanitizeHtml from 'sanitize-html';

/**
 * 제목용 sanitize (모든 HTML 태그 제거)
 */
export function sanitizeTitle({ value }: TransformFnParams): string {
  if (typeof value !== 'string') return value;
  return sanitizeHtml(value, {
    allowedTags: [],
    allowedAttributes: {},
    disallowedTagsMode: 'discard',
  });
}

/**
 * 게시글 내용용 sanitize (기본 포맷팅 허용)
 */
export function sanitizeContent({ value }: TransformFnParams): string {
  if (typeof value !== 'string') return value;
  return sanitizeHtml(value, {
    allowedTags: ['b', 'i', 'u', 'strong', 'em', 'p', 'br', 'ul', 'ol', 'li'],
    allowedAttributes: {},
    disallowedTagsMode: 'discard',
  });
}

/**
 * 댓글용 sanitize (기본 텍스트 포맷팅만 허용)
 */
export function sanitizeComment({ value }: TransformFnParams): string {
  if (typeof value !== 'string') return value;
  return sanitizeHtml(value, {
    allowedTags: ['b', 'i', 'u', 'strong', 'em'],
    allowedAttributes: {},
    disallowedTagsMode: 'discard',
  });
}
