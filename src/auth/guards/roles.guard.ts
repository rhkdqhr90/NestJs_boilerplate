import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // 메타데이터에서 필요한 역할 가져오기
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // 역할 제한이 없으면 통과
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    // 요청에서 사용자 정보 가져오기
    const { user } = context.switchToHttp().getRequest();
    const jwtPayload = user as JwtPayload;

    if (!jwtPayload || !jwtPayload.role) {
      return false;
    }

    // 사용자의 역할이 필요한 역할 중 하나에 포함되는지 확인
    return requiredRoles.includes(jwtPayload.role as UserRole);
  }
}
