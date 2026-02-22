import * as crypto from 'crypto';
import * as fs from 'fs';

/**
 * 파일 암호화/복호화 유틸리티
 * AES-256-GCM을 사용하여 민감한 파일을 보호합니다.
 *
 * 보안 개선:
 * - 파일별 랜덤 Salt 사용 (하드코딩 Salt 제거)
 * - Salt를 암호화된 파일 헤더에 포함
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // GCM 권장 IV 길이
const AUTH_TAG_LENGTH = 16; // GCM 인증 태그 길이
const SALT_LENGTH = 32;
const KEY_LENGTH = 32; // AES-256
// 파일 형식 버전 (향후 마이그레이션 용)
const FILE_FORMAT_VERSION = 2;
const VERSION_LENGTH = 1;

/**
 * 환경변수에서 마스터 키를 가져옴
 */
function getMasterKey(): string {
  const envKey = process.env.FILE_ENCRYPTION_KEY;
  if (!envKey) {
    throw new Error('FILE_ENCRYPTION_KEY 환경변수가 설정되지 않았습니다');
  }
  return envKey;
}

/**
 * Salt를 사용하여 파생 키 생성
 * 보안: 각 파일마다 고유한 salt로 다른 키 파생
 */
function deriveKey(salt: Buffer): Buffer {
  const masterKey = getMasterKey();
  return crypto.scryptSync(masterKey, salt, KEY_LENGTH);
}

/**
 * 버퍼 암호화 (V2: 파일별 랜덤 Salt)
 * 형식: Version(1) + Salt(32) + IV(16) + AuthTag(16) + EncryptedData
 */
export function encryptBuffer(buffer: Buffer): Buffer {
  // 파일별 고유 salt 생성
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = deriveKey(salt);
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Version(1) + Salt(32) + IV(16) + AuthTag(16) + EncryptedData 형식으로 저장
  const version = Buffer.from([FILE_FORMAT_VERSION]);
  return Buffer.concat([version, salt, iv, authTag, encrypted]);
}

/**
 * 버퍼 복호화 (V1, V2 모두 지원)
 * V1: IV(16) + AuthTag(16) + EncryptedData (레거시, 하드코딩 salt)
 * V2: Version(1) + Salt(32) + IV(16) + AuthTag(16) + EncryptedData
 */
export function decryptBuffer(encryptedBuffer: Buffer): Buffer {
  // 버전 확인 (첫 바이트)
  const version = encryptedBuffer[0];

  if (version === FILE_FORMAT_VERSION) {
    // V2: 랜덤 salt 사용
    const salt = encryptedBuffer.subarray(VERSION_LENGTH, VERSION_LENGTH + SALT_LENGTH);
    const key = deriveKey(salt);

    const ivStart = VERSION_LENGTH + SALT_LENGTH;
    const iv = encryptedBuffer.subarray(ivStart, ivStart + IV_LENGTH);
    const authTag = encryptedBuffer.subarray(
      ivStart + IV_LENGTH,
      ivStart + IV_LENGTH + AUTH_TAG_LENGTH,
    );
    const encrypted = encryptedBuffer.subarray(ivStart + IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  } else {
    // V1 레거시 형식 (하드코딩 salt - 기존 파일 호환)
    const legacySalt = 'verification-salt';
    const masterKey = getMasterKey();
    const key = crypto.scryptSync(masterKey, legacySalt, KEY_LENGTH);

    const iv = encryptedBuffer.subarray(0, IV_LENGTH);
    const authTag = encryptedBuffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = encryptedBuffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  }
}

/**
 * 파일 암호화 후 저장
 */
export async function encryptAndSaveFile(
  buffer: Buffer,
  filePath: string,
): Promise<void> {
  const encryptedBuffer = encryptBuffer(buffer);
  await fs.promises.writeFile(filePath, encryptedBuffer);
}

/**
 * 암호화된 파일 읽기 및 복호화
 */
export async function readAndDecryptFile(filePath: string): Promise<Buffer> {
  const encryptedBuffer = await fs.promises.readFile(filePath);
  return decryptBuffer(encryptedBuffer);
}

/**
 * 암호화 키 존재 여부 확인
 */
export function isEncryptionEnabled(): boolean {
  return !!process.env.FILE_ENCRYPTION_KEY;
}
