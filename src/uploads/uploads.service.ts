import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { PrismaService } from '../database/prisma.service';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import sharp from 'sharp';
import {
  encryptBuffer,
  decryptBuffer,
  isEncryptionEnabled,
} from '../common/utils/file-encryption.util';

export type UploadType = 'profile' | 'post' | 'verification' | 'banner';

// 이미지 최적화 설정
interface ImageOptimizationOptions {
  maxWidth: number;
  maxHeight: number;
  quality: number;
  format: 'webp' | 'jpeg' | 'png';
}

const OPTIMIZATION_PRESETS: Record<UploadType, ImageOptimizationOptions> = {
  profile: {
    maxWidth: 400,
    maxHeight: 400,
    quality: 80,
    format: 'webp',
  },
  post: {
    maxWidth: 1200,
    maxHeight: 1200,
    quality: 85,
    format: 'webp',
  },
  verification: {
    // verification은 원본 유지 (실제로 사용되지 않음)
    maxWidth: 2000,
    maxHeight: 2000,
    quality: 95,
    format: 'jpeg',
  },
  banner: {
    maxWidth: 1920,
    maxHeight: 600,
    quality: 90,
    format: 'webp',
  },
};

@Injectable()
export class UploadsService {
  private readonly uploadDir: string;
  private readonly maxFileSize = 5 * 1024 * 1024; // 5MB
  private readonly allowedMimeTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
  ];
  private readonly allowedExtensions = [
    '.jpg',
    '.jpeg',
    '.png',
    '.gif',
    '.webp',
  ];

  // 문서 파일 허용 MIME 타입 (인증 서류용)
  private readonly documentMimeTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];
  private readonly documentExtensions = ['.pdf', '.doc', '.docx'];
  private readonly verificationMaxFileSize = 10 * 1024 * 1024; // 10MB

  // 이미지 파일 매직 넘버 (파일 시그니처)
  private readonly imageMagicNumbers: { type: string; bytes: number[] }[] = [
    { type: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
    {
      type: 'image/png',
      bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    },
    { type: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] }, // GIF87a or GIF89a
    { type: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF (WebP starts with RIFF)
  ];

  // 문서 파일 매직 넘버
  private readonly documentMagicNumbers: { type: string; bytes: number[] }[] = [
    { type: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
    { type: 'application/msword', bytes: [0xd0, 0xcf, 0x11, 0xe0] }, // OLE Compound Document (DOC)
    {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      bytes: [0x50, 0x4b, 0x03, 0x04],
    }, // ZIP (DOCX는 ZIP 기반)
  ];

  constructor(
    private readonly prisma: PrismaService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {
    this.uploadDir = path.join(process.cwd(), 'uploads');
    this.ensureUploadDirs();
  }

  /**
   * 업로드 디렉토리 생성
   */
  private ensureUploadDirs() {
    const dirs = ['profile', 'post', 'verification', 'banner'];
    dirs.forEach((dir) => {
      const fullPath = path.join(this.uploadDir, dir);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
      }
    });
  }

  /**
   * 파일 매직 넘버 검증
   * 파일의 실제 바이트를 확인하여 위조된 파일 업로드 방지
   */
  private validateMagicNumber(buffer: Buffer): boolean {
    // 버퍼가 너무 짧으면 검증 불가
    if (!buffer || buffer.length < 12) {
      return false;
    }

    for (const magic of this.imageMagicNumbers) {
      // 버퍼 길이가 매직 넘버보다 짧으면 건너뛰기
      if (buffer.length < magic.bytes.length) {
        continue;
      }

      let matches = true;
      for (let i = 0; i < magic.bytes.length; i++) {
        if (buffer[i] !== magic.bytes[i]) {
          matches = false;
          break;
        }
      }
      if (matches) {
        // WebP는 추가 검증 필요 (RIFF....WEBP 형식)
        if (magic.type === 'image/webp') {
          // RIFF 이후 8-11바이트가 "WEBP"여야 함
          const webpSignature = buffer.subarray(8, 12).toString('ascii');
          if (webpSignature !== 'WEBP') {
            continue;
          }
        }
        return true;
      }
    }
    return false;
  }

  /**
   * 파일 검증
   */
  validateFile(file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('파일이 없습니다');
    }

    if (file.size > this.maxFileSize) {
      throw new BadRequestException('파일 크기는 5MB를 초과할 수 없습니다');
    }

    if (!this.allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        '허용되지 않는 파일 형식입니다. (JPEG, PNG, GIF, WebP만 허용)',
      );
    }

    // 확장자 검증
    const ext = path.extname(file.originalname).toLowerCase();
    if (!this.allowedExtensions.includes(ext)) {
      throw new BadRequestException(
        '허용되지 않는 파일 확장자입니다. (jpg, jpeg, png, gif, webp만 허용)',
      );
    }

    // 매직 넘버 검증 (파일 시그니처)
    if (!this.validateMagicNumber(file.buffer)) {
      throw new BadRequestException(
        '유효하지 않은 이미지 파일입니다. 파일이 손상되었거나 위조되었을 수 있습니다.',
      );
    }
  }

  /**
   * 이미지 최적화 (리사이즈 + 압축 + WebP 변환)
   */
  private async optimizeImage(
    buffer: Buffer,
    type: UploadType,
    originalMimetype: string,
  ): Promise<{ buffer: Buffer; format: string }> {
    const options = OPTIMIZATION_PRESETS[type];

    // GIF는 애니메이션 때문에 최적화 스킵 (원본 유지)
    if (originalMimetype === 'image/gif') {
      return { buffer, format: 'gif' };
    }

    try {
      let pipeline = sharp(buffer);

      // 메타데이터 가져오기
      const metadata = await pipeline.metadata();

      // 리사이즈 (최대 크기 초과 시에만)
      if (
        metadata.width &&
        metadata.height &&
        (metadata.width > options.maxWidth ||
          metadata.height > options.maxHeight)
      ) {
        pipeline = pipeline.resize(options.maxWidth, options.maxHeight, {
          fit: 'inside',
          withoutEnlargement: true,
        });
      }

      // 회전 메타데이터 기반 자동 회전
      pipeline = pipeline.rotate();

      // 포맷 변환 및 압축
      let optimizedBuffer: Buffer;
      if (options.format === 'webp') {
        optimizedBuffer = await pipeline
          .webp({ quality: options.quality })
          .toBuffer();
      } else if (options.format === 'jpeg') {
        optimizedBuffer = await pipeline
          .jpeg({ quality: options.quality })
          .toBuffer();
      } else {
        optimizedBuffer = await pipeline
          .png({ quality: options.quality })
          .toBuffer();
      }

      this.logger.log(
        `Image optimized: ${buffer.length} bytes -> ${optimizedBuffer.length} bytes (${Math.round((1 - optimizedBuffer.length / buffer.length) * 100)}% reduction)`,
        'UploadsService',
      );

      return { buffer: optimizedBuffer, format: options.format };
    } catch (error) {
      // 최적화 실패 시 원본 반환
      this.logger.warn(
        `Image optimization failed, using original: ${error}`,
        'UploadsService',
      );
      const ext = originalMimetype.split('/')[1] || 'jpeg';
      return { buffer, format: ext };
    }
  }

  /**
   * 파일 저장 (이미지 최적화 포함)
   */
  async saveFile(
    file: Express.Multer.File,
    type: UploadType,
    userId: string,
  ): Promise<string> {
    this.validateFile(file);

    // userId 검증 (Path Traversal 방지)
    if (!userId || !/^[a-zA-Z0-9_-]+$/.test(userId)) {
      throw new BadRequestException('유효하지 않은 사용자 ID입니다');
    }

    // type 검증
    const validTypes: UploadType[] = ['profile', 'post', 'verification', 'banner'];
    if (!validTypes.includes(type)) {
      throw new BadRequestException('유효하지 않은 업로드 타입입니다');
    }

    // 이미지 최적화
    const { buffer: optimizedBuffer, format } = await this.optimizeImage(
      file.buffer,
      type,
      file.mimetype,
    );

    // 파일명 생성: userId_timestamp_random.ext (안전한 문자만 사용)
    const timestamp = Date.now();
    const random = crypto.randomBytes(8).toString('hex');
    const safeFormat = format.replace(/[^a-z0-9]/gi, '');
    const filename = `${userId}_${timestamp}_${random}.${safeFormat}`;

    // 저장 경로 검증
    const typeDir = path.resolve(this.uploadDir, type);
    const filePath = path.resolve(typeDir, filename);

    // Path Traversal 최종 검증
    if (!filePath.startsWith(typeDir + path.sep)) {
      throw new BadRequestException('잘못된 파일 경로입니다');
    }

    // 최적화된 이미지 저장
    await fs.promises.writeFile(filePath, optimizedBuffer);

    // URL 반환 (상대 경로)
    return `/uploads/${type}/${filename}`;
  }

  /**
   * 프로필 이미지 업데이트
   */
  async updateProfileImage(userId: string, file: Express.Multer.File) {
    // 기존 프로필 이미지 가져오기
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { profileImage: true },
    });

    // 새 이미지 저장
    const imageUrl = await this.saveFile(file, 'profile', userId);

    // DB 업데이트
    await this.prisma.user.update({
      where: { id: userId },
      data: { profileImage: imageUrl },
    });

    // 기존 이미지 삭제 (존재하면)
    if (user?.profileImage) {
      await this.deleteFile(user.profileImage);
    }

    return { imageUrl };
  }

  /**
   * 파일 삭제
   */
  async deleteFile(fileUrl: string): Promise<void> {
    try {
      // URL에서 파일 경로 추출
      const relativePath = fileUrl.replace('/uploads/', '');

      // Path Traversal 공격 방지
      const filePath = path.join(this.uploadDir, relativePath);
      const normalizedPath = path.normalize(filePath);

      // uploadDir 내부 경로인지 검증
      if (!normalizedPath.startsWith(this.uploadDir + path.sep)) {
        this.logger.warn(
          `Path traversal attempt detected: ${fileUrl}`,
          'UploadsService',
        );
        return;
      }

      if (fs.existsSync(normalizedPath)) {
        await fs.promises.unlink(normalizedPath);
      }
    } catch (error) {
      // 파일 삭제 실패는 로깅만 (크리티컬하지 않음)
      this.logger.error('Failed to delete file', error, 'UploadsService');
    }
  }

  /**
   * 프로필 이미지 삭제
   */
  async deleteProfileImage(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { profileImage: true },
    });

    if (user?.profileImage) {
      await this.deleteFile(user.profileImage);

      await this.prisma.user.update({
        where: { id: userId },
        data: { profileImage: null },
      });
    }

    return { message: '프로필 이미지가 삭제되었습니다' };
  }

  // ========================================
  // 인증 서류 업로드 (PDF/DOC 지원)
  // ========================================

  /**
   * 문서 파일 매직 넘버 검증
   */
  private validateDocumentMagicNumber(
    buffer: Buffer,
    mimetype: string,
  ): boolean {
    if (!buffer || buffer.length < 4) {
      return false;
    }

    for (const magic of this.documentMagicNumbers) {
      if (buffer.length < magic.bytes.length) {
        continue;
      }

      let matches = true;
      for (let i = 0; i < magic.bytes.length; i++) {
        if (buffer[i] !== magic.bytes[i]) {
          matches = false;
          break;
        }
      }

      if (matches) {
        // PDF는 정확히 %PDF로 시작
        if (
          magic.type === 'application/pdf' &&
          mimetype === 'application/pdf'
        ) {
          return true;
        }
        // DOC는 OLE 컴파운드 문서
        if (
          magic.type === 'application/msword' &&
          mimetype === 'application/msword'
        ) {
          return true;
        }
        // DOCX는 ZIP 기반 (PK로 시작)
        if (
          magic.type ===
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document' &&
          mimetype ===
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * 인증 서류 파일 검증 (이미지 + PDF + DOC)
   */
  validateVerificationFile(file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('파일이 없습니다');
    }

    if (file.size > this.verificationMaxFileSize) {
      throw new BadRequestException('파일 크기는 10MB를 초과할 수 없습니다');
    }

    const ext = path.extname(file.originalname).toLowerCase();

    // 이미지 파일인 경우
    if (this.allowedMimeTypes.includes(file.mimetype)) {
      if (!this.allowedExtensions.includes(ext)) {
        throw new BadRequestException('허용되지 않는 파일 확장자입니다');
      }
      if (!this.validateMagicNumber(file.buffer)) {
        throw new BadRequestException('유효하지 않은 이미지 파일입니다');
      }
      return;
    }

    // 문서 파일인 경우
    if (this.documentMimeTypes.includes(file.mimetype)) {
      if (!this.documentExtensions.includes(ext)) {
        throw new BadRequestException('허용되지 않는 파일 확장자입니다');
      }
      if (!this.validateDocumentMagicNumber(file.buffer, file.mimetype)) {
        throw new BadRequestException('유효하지 않은 문서 파일입니다');
      }
      return;
    }

    throw new BadRequestException(
      '허용되지 않는 파일 형식입니다. (JPEG, PNG, GIF, WebP, PDF, DOC, DOCX만 허용)',
    );
  }

  /**
   * 인증 서류 파일 저장 (암호화 지원)
   */
  async saveVerificationFile(
    file: Express.Multer.File,
    userId: string,
  ): Promise<{
    fileUrl: string;
    originalFileName: string;
    fileType: string;
    fileSize: number;
    isEncrypted: boolean;
  }> {
    this.validateVerificationFile(file);

    const timestamp = Date.now();
    const random = crypto.randomBytes(8).toString('hex');
    const ext = path.extname(file.originalname).toLowerCase();

    // 암호화 활성화 시 .enc 확장자 추가
    const shouldEncrypt = isEncryptionEnabled();
    const filename = shouldEncrypt
      ? `${userId}_${timestamp}_${random}${ext}.enc`
      : `${userId}_${timestamp}_${random}${ext}`;

    const filePath = path.join(this.uploadDir, 'verification', filename);

    // 암호화 후 저장 또는 원본 저장
    if (shouldEncrypt) {
      const encryptedBuffer = encryptBuffer(file.buffer);
      await fs.promises.writeFile(filePath, encryptedBuffer);
      this.logger.log(
        `Verification file saved (encrypted): ${filename} (${file.size} bytes -> ${encryptedBuffer.length} bytes)`,
        'UploadsService',
      );
    } else {
      await fs.promises.writeFile(filePath, file.buffer);
      this.logger.log(
        `Verification file saved: ${filename} (${file.size} bytes)`,
        'UploadsService',
      );
    }

    return {
      fileUrl: `/uploads/verification/${filename}`,
      originalFileName: file.originalname,
      fileType: file.mimetype,
      fileSize: file.size,
      isEncrypted: shouldEncrypt,
    };
  }

  /**
   * 암호화된 인증 파일 읽기
   */
  async readVerificationFile(
    fileUrl: string,
    isEncrypted: boolean,
  ): Promise<Buffer> {
    // URL 디코딩 후 파일명 추출 (URL 인코딩 공격 방어)
    let filename = fileUrl.replace('/uploads/verification/', '');
    try {
      filename = decodeURIComponent(filename);
    } catch {
      throw new BadRequestException('잘못된 파일 경로입니다');
    }

    // Path Traversal 방지: 안전한 방법으로 파일 경로 검증
    // 1. 정규화된 경로 생성
    const uploadsDir = path.resolve(this.uploadDir, 'verification');
    const filePath = path.resolve(uploadsDir, path.basename(filename)); // basename만 사용

    // 2. 최종 경로가 업로드 디렉토리 내에 있는지 확인
    if (!filePath.startsWith(uploadsDir + path.sep)) {
      throw new BadRequestException('잘못된 파일 경로입니다');
    }

    // 3. 파일 존재 여부 확인
    if (!fs.existsSync(filePath)) {
      throw new BadRequestException('파일을 찾을 수 없습니다');
    }

    const fileBuffer = await fs.promises.readFile(filePath);

    // 암호화된 파일이면 복호화
    if (isEncrypted) {
      return decryptBuffer(fileBuffer);
    }

    return fileBuffer;
  }
}
