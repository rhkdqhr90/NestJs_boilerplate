import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

// 관리자 전용 데코레이터 (편의용)
export const Admin = () => SetMetadata(ROLES_KEY, [UserRole.ADMIN]);
