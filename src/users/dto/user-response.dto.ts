import { User } from '@prisma/client';

// password를 제외한 User 타입
type UserWithoutPassword = Omit<User, 'password' | 'providerId'>;

export class UserResponseDto {
  id: string;
  email: string;
  nickname: string;
  role: string;
  provider: string;
  isVerified: boolean;
  profileImage: string | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;

  constructor(user: UserWithoutPassword) {
    this.id = user.id;
    this.email = user.email;
    this.nickname = user.nickname;
    this.role = user.role;
    this.provider = user.provider || 'local';
    this.isVerified = user.isVerified;
    this.profileImage = user.profileImage;
    this.lastLoginAt = user.lastLoginAt;
    this.createdAt = user.createdAt;
    this.updatedAt = user.updatedAt;
  }
}
