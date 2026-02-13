import { createHash } from 'crypto';

/**
 * IP 주소를 SHA256으로 해싱
 * 익명 게시글 작성자 식별용
 */
export function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex');
}
