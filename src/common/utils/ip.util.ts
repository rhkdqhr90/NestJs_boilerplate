import { createHash } from 'crypto';

/**
 * IP 주소를 SHA256으로 해싱 (솔트 포함)
 * 익명 게시글 작성자 식별용
 *
 * 보안: 솔트를 추가하여 레인보우 테이블 공격 및 역해싱 방지
 * IPv4 주소 공간이 제한적(43억)이므로 솔트 없이는 역해싱 가능
 */
export function hashIp(ip: string): string {
  const salt = process.env.IP_HASH_SALT;
  if (!salt) {
    throw new Error('IP_HASH_SALT environment variable is required');
  }
  return createHash('sha256')
    .update(`${salt}:${ip}`)
    .digest('hex');
}
