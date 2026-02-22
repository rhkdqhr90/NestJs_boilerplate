import { User, JobType, ExpertType } from '@prisma/client';

// password와 providerId를 제외한 User 타입
type UserWithoutPassword = Omit<User, 'password' | 'providerId'>;

export class UserResponseDto {
  id: string;
  email: string;
  nickname: string;
  role: string;
  provider: string;
  isVerified: boolean;
  jobType: JobType | null;
  career: number | null;
  profileImage: string | null;
  isExpert: boolean;
  expertType: ExpertType | null;
  expertVerifiedAt: Date | null;
  lastLoginAt: Date | null;
  isBanned: boolean;
  bannedAt: Date | null;
  bannedUntil: Date | null;
  banReason: string | null;
  createdAt: Date;
  updatedAt: Date;

  constructor(user: UserWithoutPassword) {
    this.id = user.id;
    this.email = user.email;
    this.nickname = user.nickname;
    this.role = user.role;
    this.provider = user.provider || 'local';
    this.isVerified = user.isVerified;
    this.jobType = user.jobType;
    this.career = user.career;
    this.profileImage = user.profileImage;
    this.isExpert = user.isExpert;
    this.expertType = user.expertType;
    this.expertVerifiedAt = user.expertVerifiedAt;
    this.lastLoginAt = user.lastLoginAt;
    this.isBanned = user.isBanned;
    this.bannedAt = user.bannedAt;
    this.bannedUntil = user.bannedUntil;
    this.banReason = user.banReason;
    this.createdAt = user.createdAt;
    this.updatedAt = user.updatedAt;
  }
}
