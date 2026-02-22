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
 * 게시글 내용용 sanitize (WYSIWYG 에디터 출력 허용)
 * - Tiptap 에디터에서 생성하는 HTML 태그 지원
 * - XSS 방지: 허용된 태그/속성만 통과
 */
export function sanitizeContent({ value }: TransformFnParams): string {
  if (typeof value !== 'string') return value;
  return sanitizeHtml(value, {
    allowedTags: [
      // 텍스트 포맷팅
      'b', 'i', 'u', 'strong', 'em', 's', 'strike',
      // 구조
      'p', 'br', 'div',
      // 제목
      'h1', 'h2', 'h3',
      // 리스트
      'ul', 'ol', 'li',
      // 링크
      'a',
      // 이미지
      'img',
    ],
    allowedAttributes: {
      'a': ['href', 'target', 'rel'],
      'img': ['src', 'alt', 'class', 'loading'],
      // text-align 스타일 허용 (정렬 기능)
      '*': ['style'],
    },
    allowedStyles: {
      '*': {
        'text-align': [/^left$/, /^center$/, /^right$/],
      },
    },
    // URL 보안: http/https만 허용 (javascript:, data: 등 차단)
    allowedSchemes: ['http', 'https'],
    allowedSchemesByTag: {
      img: ['http', 'https'],
      a: ['http', 'https'],
    },
    // 외부 링크는 새 탭에서 열기
    transformTags: {
      'a': (tagName, attribs) => {
        return {
          tagName,
          attribs: {
            ...attribs,
            target: '_blank',
            rel: 'noopener noreferrer',
          },
        };
      },
    },
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
