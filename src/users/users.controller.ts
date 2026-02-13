import {
  Controller,
  Get,
  Patch,
  Delete,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@Controller('users')
@UseGuards(JwtAuthGuard) // 전체 인증 필요
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ========================================
  // 1. 내 프로필 조회
  // ========================================
  @Get('me')
  async getProfile(@Req() req: Request): Promise<UserResponseDto> {
    const user = req.user as JwtPayload;
    const profile = await this.usersService.findOne(user.sub);
    return new UserResponseDto(profile);
  }

  // ========================================
  // 2. 프로필 수정
  // ========================================
  @Patch('me')
  @Throttle({ default: { ttl: 60000, limit: 10 } }) // 1분에 10번
  async updateProfile(
    @Req() req: Request,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    const user = req.user as JwtPayload;
    const updatedUser = await this.usersService.update(user.sub, updateUserDto);
    return new UserResponseDto(updatedUser);
  }

  // ========================================
  // 3. 비밀번호 변경
  // ========================================
  @Patch('me/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { ttl: 60000, limit: 3 } }) // 1분에 3번 (보안 민감)
  async changePassword(
    @Req() req: Request,
    @Body() changePasswordDto: ChangePasswordDto,
  ): Promise<void> {
    const user = req.user as JwtPayload;
    await this.usersService.changePassword(user.sub, changePasswordDto);
  }

  // ========================================
  // 4. 회원 탈퇴 (비밀번호 확인!)
  // ========================================
  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { ttl: 60000, limit: 2 } }) // 1분에 2번 (매우 민감)
  async deleteAccount(
    @Req() req: Request,
    @Body() deleteAccountDto: DeleteAccountDto,
  ): Promise<void> {
    const user = req.user as JwtPayload;
    await this.usersService.remove(user.sub, deleteAccountDto.password);
  }
}
