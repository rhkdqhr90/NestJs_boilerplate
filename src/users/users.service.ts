import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  private readonly SALT_ROUNDS = 10;

  constructor(private prisma: PrismaService) {}

  // ========================================
  // 1. 유저 조회 (password 제외!)
  // ========================================
  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        nickname: true,
        role: true,
        provider: true,
        providerId: true,
        isVerified: true,
        profileImage: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  // ========================================
  // 비밀번호 포함 조회 (내부 전용)
  // ========================================
  private async findOneWithPassword(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  // ========================================
  // 2. 프로필 수정
  // ========================================
  async update(id: string, updateUserDto: UpdateUserDto) {
    // 유저 존재 확인
    await this.findOne(id);

    // 이메일 변경 시 중복 확인
    if (updateUserDto.email) {
      const existingUser = await this.prisma.user.findUnique({
        where: { email: updateUserDto.email },
      });

      if (existingUser && existingUser.id !== id) {
        throw new ConflictException('Email already exists');
      }

      // TODO: Phase 2 - 이메일 변경 시 재인증 필요
      // 지금은 즉시 변경, isVerified = false로 설정
    }

    // 업데이트
    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: {
        ...updateUserDto,
        // 이메일 변경 시 인증 해제
        ...(updateUserDto.email && { isVerified: false }),
      },
      select: {
        id: true,
        email: true,
        nickname: true,
        role: true,
        provider: true,
        providerId: true,
        isVerified: true,
        profileImage: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return updatedUser;
  }

  // ========================================
  // 3. 비밀번호 변경 (RefreshToken 무효화!)
  // ========================================
  async changePassword(id: string, changePasswordDto: ChangePasswordDto) {
    // 유저 조회 (password 포함)
    const user = await this.findOneWithPassword(id);

    // OAuth 사용자 체크
    if (!user.password) {
      throw new UnauthorizedException(
        'Cannot change password for social login accounts',
      );
    }

    // 현재 비밀번호 확인
    const isPasswordValid = await bcrypt.compare(
      changePasswordDto.currentPassword,
      user.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    // 새 비밀번호 해싱
    const hashedPassword = await bcrypt.hash(
      changePasswordDto.newPassword,
      this.SALT_ROUNDS,
    );

    // 트랜잭션: 비밀번호 변경 + RefreshToken 모두 무효화
    await this.prisma.$transaction([
      // 1. 비밀번호 업데이트
      this.prisma.user.update({
        where: { id },
        data: { password: hashedPassword },
      }),
      // 2. 모든 RefreshToken 무효화 (보안!)
      this.prisma.refreshToken.updateMany({
        where: {
          userId: id,
          revokedAt: null, // 아직 유효한 토큰만
        },
        data: {
          revokedAt: new Date(),
        },
      }),
    ]);
  }

  // ========================================
  // 4. 회원 탈퇴 (비밀번호 확인!)
  // ========================================
  async remove(id: string, password: string) {
    // 유저 조회 (password 포함)
    const user = await this.findOneWithPassword(id);

    // Local 사용자는 비밀번호 확인
    if (user.password) {
      const isPasswordValid = await bcrypt.compare(password, user.password);

      if (!isPasswordValid) {
        throw new UnauthorizedException('Password is incorrect');
      }
    }

    // 삭제 (Cascade로 연관 데이터도 삭제됨)
    await this.prisma.user.delete({
      where: { id },
    });
  }
}
