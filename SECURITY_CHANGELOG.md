# 보안 변경 이력

이 문서는 보안 관련 수정 사항을 기록합니다. 코드 수정 시 이 내용을 참고하여 보안 패치가 실수로 되돌려지지 않도록 합니다.

---

## 2026-02-21 보안 개선 2차 (토큰/IP/리소스 관리)

### CRITICAL 수정 사항

#### 1. JWT AccessToken 블랙리스트 검증 (기존 구현 확인)
- **파일**: `src/auth/strategies/jwt.strategy.ts:27-46`
- **상태**: ✅ 이미 올바르게 구현됨
- **동작**: 토큰의 `iat`(발급 시간)을 기준으로 블랙리스트 확인
```typescript
const blacklistEntry = await this.prisma.tokenBlacklist.findFirst({
  where: {
    userId: payload.sub,
    revokedAt: { gte: tokenIssuedAt }, // 토큰 발급 후 블랙리스트 추가됨
    expiresAt: { gt: new Date() },     // 아직 만료 안 됨
  },
});
if (blacklistEntry) throw new UnauthorizedException('인증이 만료되었습니다');
```

#### 2. IPv6 압축 형식 검증 수정
- **파일**: `src/posts/posts.controller.ts:40-72`
- **문제**: 이전 정규식이 `::1`, `2001:db8::1` 등 압축 형식 미지원
- **수정**: 더블 콜론(::) 확장 알고리즘 구현
```typescript
function isValidIPv6(ip: string): boolean {
  // :: (더블 콜론)은 한 번만 허용
  const doubleColonCount = (ip.match(/::/g) || []).length;
  if (doubleColonCount > 1) return false;

  // 압축 형식 확장
  if (ip.includes('::')) {
    const parts = ip.split('::');
    const left = parts[0] ? parts[0].split(':') : [];
    const right = parts[1] ? parts[1].split(':') : [];
    const missing = 8 - left.length - right.length;
    if (missing < 0) return false;
    const middle = Array(missing).fill('0');
    expanded = [...left, ...middle, ...right].join(':');
  }
  // 8개 세그먼트 검증...
}
```

#### 3. IPv4 범위 검증 강화 (0-255)
- **파일**: `src/posts/posts.controller.ts:25-38`
- **문제**: 이전 정규식이 `999.999.999.999` 허용
- **수정**: 각 옥텟을 숫자로 파싱하여 0-255 범위 검증
```typescript
function isValidIPv4(ip: string): boolean {
  const cleanIp = ip.replace(/^::ffff:/i, '');
  const parts = cleanIp.split('.');
  if (parts.length !== 4) return false;

  return parts.every((part) => {
    const num = parseInt(part, 10);
    return !isNaN(num) && num >= 0 && num <= 255 && part === String(num);
  });
}
```

---

### HIGH 수정 사항

#### 4. 토큰 리프레시 무한 루프 방지
- **파일**: `frontend/src/lib/api-client.ts:21-23, 140-145`
- **문제**: 401 응답 시 무한 refresh 시도 가능
- **수정**: `MAX_REFRESH_FAILURES = 3` 제한
```typescript
let refreshFailCount = 0;
const MAX_REFRESH_FAILURES = 3;

if (refreshFailCount >= MAX_REFRESH_FAILURES) {
  useAuthStore.getState().clearAuth();
  refreshFailCount = 0;
  throw new ApiError(401, '세션이 만료되었습니다');
}
```

#### 5. TokenBlacklist 자동 정리
- **파일**: `src/auth/token-cleanup.service.ts:44-49`
- **문제**: RefreshToken만 정리하고 TokenBlacklist는 정리 안 됨
- **수정**: 1시간마다 만료된 블랙리스트 항목 자동 삭제
```typescript
const blacklistResult = await this.prisma.tokenBlacklist.deleteMany({
  where: {
    expiresAt: { lt: new Date() },
  },
});
```

#### 6. 비밀번호 변경 시 AccessToken 블랙리스트 추가
- **파일**: `src/auth/auth.service.ts:528-536`
- **문제**: 비밀번호 변경 후에도 기존 AccessToken 유효
- **수정**: resetPassword 트랜잭션에 블랙리스트 추가
```typescript
await this.prisma.$transaction([
  // ... 비밀번호 변경, RefreshToken 무효화 ...
  this.prisma.tokenBlacklist.create({
    data: {
      userId: resetToken.userId,
      expiresAt: accessTokenExpiry,
      revokedAt: new Date(),
      reason: 'password_reset',
    },
  }),
]);
```

#### 7. setInterval 리소스 누수 방지
- **파일**: `src/auth/token-cleanup.service.ts:31-38`
- **문제**: 서버 종료 시 타이머가 정리되지 않음
- **수정**: `OnModuleDestroy` 구현으로 `clearInterval()` 호출
```typescript
export class TokenCleanupService implements OnModuleInit, OnModuleDestroy {
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  onModuleDestroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}
```

---

### MEDIUM 수정 사항

#### 8. 429 Rate Limit 재시도에 Jitter 추가
- **파일**: `frontend/src/lib/api-client.ts:114-116`
- **문제**: 동시 요청 시 모두 같은 시간에 재시도하여 캐스케이드 발생
- **수정**: 0~20% 랜덤 지연(Jitter) 추가
```typescript
// Jitter 추가 (0~20% 랜덤 지연)
const jitter = Math.random() * delay * 0.2;
delay = delay + jitter;
delay = Math.min(delay, 10000); // 최대 10초
```

#### 9. HTTP-date 형식 Retry-After 지원
- **파일**: `frontend/src/lib/api-client.ts:100-108`
- **문제**: 초 단위만 파싱하여 HTTP-date 형식 무시
- **수정**: 두 형식 모두 지원
```typescript
if (/^\d+$/.test(retryAfterHeader)) {
  delay = parseInt(retryAfterHeader, 10) * 1000;
} else {
  // HTTP-date 형식 파싱
  const retryDate = new Date(retryAfterHeader);
  delay = Math.max(0, retryDate.getTime() - Date.now());
}
```

#### 10. 조회수 조작 방지 - ViewTracker 메모리 보호
- **파일**: `src/common/utils/view-tracker.util.ts:17, 41-43, 53-63`
- **문제**: 캐시 무한 증가로 메모리 누수 가능
- **수정**: `MAX_CACHE_SIZE = 100000` + LRU 스타일 제거
```typescript
private readonly MAX_CACHE_SIZE = 100000;

if (this.cache.size >= this.MAX_CACHE_SIZE) {
  this.evictOldestRecords(); // 가장 오래된 10% 제거
}
```

#### 11. Path Traversal 최종 검증 강화
- **파일**: `src/uploads/uploads.service.ts:293-300`
- **문제**: 기존 검증 우회 가능성
- **수정**: `path.resolve()` + `startsWith()` 이중 검증
```typescript
const typeDir = path.resolve(this.uploadDir, type);
const filePath = path.resolve(typeDir, filename);

if (!filePath.startsWith(typeDir + path.sep)) {
  throw new BadRequestException('잘못된 파일 경로입니다');
}
```

#### 12. console.log → Winston Logger 통합
- **파일**: `src/mail/mail.service.ts`, `src/common/middleware/csrf.middleware.ts`
- **문제**: NestJS 표준 로깅 미사용
- **수정**: `@Inject(WINSTON_MODULE_NEST_PROVIDER)` 사용
```typescript
constructor(
  @Inject(WINSTON_MODULE_NEST_PROVIDER)
  private readonly logger: LoggerService,
) {}
```

---

## 2026-02-21 추가 주의 사항

### 절대 되돌리면 안 되는 변경 사항 (추가)

6. **IPv4/IPv6 검증 함수** - IP 스푸핑 및 조회수 조작 방지
7. **MAX_REFRESH_FAILURES 제한** - 무한 루프 방지
8. **TokenBlacklist 자동 정리** - 데이터베이스 비대화 방지
9. **onModuleDestroy 구현** - 리소스 누수 방지
10. **Jitter 추가** - 재시도 캐스케이드 방지

### 코드 리뷰 체크리스트 (추가)

- [ ] IP 검증 관련 코드 수정 시 `isValidIPv4`, `isValidIPv6` 함수 유지 확인
- [ ] 토큰 리프레시 로직 수정 시 `MAX_REFRESH_FAILURES` 확인
- [ ] setInterval 사용 시 `OnModuleDestroy`로 정리 확인
- [ ] Rate Limit 재시도 로직에 Jitter 포함 확인
- [ ] 캐시/메모리 저장소에 최대 크기 제한 확인

---

## 2026-02-20 보안 감사 및 수정

### CRITICAL 수정 사항

#### 1. OAuth 계정 자동 연결 취약점 수정
- **파일**: `src/auth/auth.service.ts`
- **문제**: 이메일이 동일하면 OAuth 계정을 기존 계정에 자동 연결
- **공격 시나리오**: 공격자가 피해자 이메일로 OAuth 계정을 만들어 계정 탈취 가능
- **수정**: 자동 연결 대신 `ConflictException` 발생
```typescript
// 수정 전: 자동 연결
if (existingUser) {
  return this.prisma.user.update({ ... providerId 연결 });
}

// 수정 후: 에러 발생
if (existingUser) {
  throw new ConflictException('이미 다른 방식으로 가입된 이메일입니다.');
}
```

#### 2. 사용자 정지 Race Condition 수정
- **파일**: `src/reports/reports.service.ts`
- **문제**: 정지 처리와 토큰 삭제가 원자적이지 않아 Race Condition 발생 가능
- **수정**: Prisma `$transaction`으로 원자적 처리
```typescript
await this.prisma.$transaction(async (tx) => {
  await tx.user.update({ ... isBanned: true });
  await tx.refreshToken.deleteMany({ ... });
  await tx.tokenBlacklist.create({ ... });
});
```

#### 3. JWT 토큰 블랙리스트 구현
- **파일**: `prisma/schema.prisma`, `src/auth/strategies/jwt.strategy.ts`
- **문제**: 비밀번호 변경/정지 시 기존 토큰이 만료까지 유효
- **수정**:
  - `TokenBlacklist` 모델 추가
  - JWT 검증 시 블랙리스트 확인
  - 비밀번호 변경, 사용자 정지 시 블랙리스트에 추가

#### 4. 관리자 파일 접근 로깅 강화
- **파일**: `src/uploads/uploads.service.ts`
- **상태**: 이미 구현됨 (로깅 포함)

---

### HIGH 수정 사항

#### 5. Path Traversal 검증 강화
- **파일**: `src/uploads/uploads.service.ts`
- **문제**: URL 인코딩된 경로로 우회 가능
- **수정**:
  - `decodeURIComponent()` 적용
  - `path.basename()` 사용
  - 경로 검증 강화
```typescript
let filename = fileUrl.replace('/uploads/verification/', '');
try { filename = decodeURIComponent(filename); } catch { throw new BadRequestException(...); }
const filePath = path.resolve(uploadsDir, path.basename(filename));
if (!filePath.startsWith(uploadsDir + path.sep)) { throw new BadRequestException(...); }
```

#### 6. 개발환경 CSRF 활성화
- **파일**: `src/common/middleware/csrf.middleware.ts`
- **문제**: 개발 환경에서 CSRF 검증 완전 비활성화
- **수정**: localhost 요청만 허용
```typescript
if (process.env.NODE_ENV === 'development') {
  const host = req.headers.host;
  const isLocalhost = host?.startsWith('localhost:') || host?.startsWith('127.0.0.1:');
  if (isLocalhost) return next();
}
throw new ForbiddenException('Missing origin header');
```

#### 7. OAuth Redirect URL 검증
- **파일**: `src/auth/auth.controller.ts`
- **문제**: Open Redirect 취약점 가능성
- **수정**: 화이트리스트 기반 검증
```typescript
private readonly ALLOWED_REDIRECT_ORIGINS = [
  'http://localhost:3001',
  'http://127.0.0.1:3001',
];
private validateRedirectUrl(url: string): string { ... }
```

#### 8. 파일 암호화 Salt 개선
- **파일**: `src/common/utils/file-encryption.util.ts`
- **문제**: 하드코딩된 salt ('verification-salt') 사용
- **수정**:
  - V2 형식: 파일별 랜덤 salt
  - V1 레거시 호환 유지
```typescript
// V2 형식: Version(1) + Salt(32) + IV(16) + AuthTag(16) + EncryptedData
const FILE_FORMAT_VERSION = 2;
```

#### 9. 관리자 입력 검증 강화
- **파일**: `src/reports/reports.service.ts`
- **수정**:
  - 이미 처리된 신고 중복 처리 방지
  - 조치와 신고 타입 일치 검증
```typescript
if (report.status !== ReportStatus.PENDING) {
  throw new BadRequestException('이미 처리된 신고입니다');
}
this.validateActionForReportType(report.type, dto.action);
```

---

### MEDIUM 수정 사항

#### 10. 이메일 인증 Rate Limit 강화
- **파일**: `src/auth/auth.controller.ts`
- **수정**:
  - `verify-email`: 1분에 10번 → 5번
  - `resend-verification`: 1분에 3번 → 5분에 3번

#### 11. 오류 메시지 정보 노출 제한
- **파일**: `src/common/filters/all-exceptions.filter.ts`, `http-exception.filter.ts`
- **수정**: 프로덕션에서 path, method, 스택 정보 숨김
```typescript
if (!this.isProduction) {
  errorResponse.path = request.url;
  errorResponse.method = request.method;
}
```

---

## 주의 사항

### 절대 되돌리면 안 되는 변경 사항

1. **OAuth 자동 연결 로직** - 계정 탈취 취약점
2. **$transaction 제거** - Race Condition 취약점
3. **토큰 블랙리스트 검증** - 즉시 세션 무효화 필수
4. **Path Traversal 검증** - 파일 시스템 접근 취약점
5. **Rate Limit 값 증가** - 브루트포스 공격 가능
6. **IPv4/IPv6 검증 함수** - IP 스푸핑 및 조회수 조작 방지
7. **MAX_REFRESH_FAILURES 제한** - 무한 루프 및 서버 부하 방지
8. **TokenBlacklist 자동 정리** - 데이터베이스 비대화 방지
9. **onModuleDestroy 구현** - 메모리 및 타이머 리소스 누수 방지
10. **Jitter 추가** - Rate Limit 재시도 캐스케이드 방지
11. **MAX_CACHE_SIZE 제한** - ViewTracker 메모리 누수 방지

### 코드 리뷰 체크리스트

- [ ] OAuth 관련 코드 수정 시 자동 연결 로직 확인
- [ ] 사용자 상태 변경 시 트랜잭션 사용 확인
- [ ] 인증 관련 API의 Rate Limit 확인
- [ ] 파일 경로 처리 시 Path Traversal 검증 확인
- [ ] 에러 응답에 민감한 정보 포함 여부 확인
- [ ] IP 검증 관련 코드 수정 시 `isValidIPv4`, `isValidIPv6` 함수 유지 확인
- [ ] 토큰 리프레시 로직 수정 시 `MAX_REFRESH_FAILURES` 확인
- [ ] setInterval 사용 시 `OnModuleDestroy`로 정리 확인
- [ ] Rate Limit 재시도 로직에 Jitter 포함 확인
- [ ] 캐시/메모리 저장소에 최대 크기 제한 확인
