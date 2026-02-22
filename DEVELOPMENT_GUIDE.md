# 개발 가이드

이 문서는 코드 작성 시 주의해야 할 패턴과 규칙을 설명합니다.

---

## 비동기 처리 (async/await)

### 필수 규칙

#### 1. Prisma 메서드는 항상 await 사용

```typescript
// ✅ 올바름
const user = await this.prisma.user.findUnique({ where: { id } });
const posts = await this.prisma.post.findMany({ where: { authorId } });
await this.prisma.comment.create({ data: { ... } });
await this.prisma.post.update({ where: { id }, data: { ... } });
await this.prisma.notification.delete({ where: { id } });

// ❌ 잘못됨 - await 누락
const user = this.prisma.user.findUnique({ where: { id } }); // Promise가 반환됨!
this.prisma.post.delete({ where: { id } }); // 삭제가 완료되기 전에 다음 코드 실행!
```

#### 2. 서비스 메서드 호출 시 await 사용

```typescript
// ✅ 올바름
await this.uploadsService.deleteFile(fileUrl);
await this.notificationsService.create(userId, type, data);
const result = await this.authService.validateUser(email, password);

// ❌ 잘못됨
this.uploadsService.deleteFile(fileUrl); // 파일 삭제 완료 전에 반환될 수 있음
```

#### 3. 트랜잭션은 반드시 await

```typescript
// ✅ 올바름
await this.prisma.$transaction(async (tx) => {
  await tx.user.update({ ... });
  await tx.refreshToken.deleteMany({ ... });
});

// ❌ 잘못됨
this.prisma.$transaction(async (tx) => { ... }); // 트랜잭션 완료 전에 반환!
```

#### 4. Promise.all 사용 시

```typescript
// ✅ 올바름 - 병렬 실행이 필요할 때
const [posts, total] = await Promise.all([
  this.prisma.post.findMany({ ... }),
  this.prisma.post.count({ ... }),
]);

// ✅ 올바름 - 순차 실행이 필요할 때
const user = await this.prisma.user.findUnique({ ... });
const posts = await this.prisma.post.findMany({ where: { authorId: user.id } });
```

### 예외 케이스: Fire-and-Forget 패턴

알림 전송 등 결과가 메인 로직에 영향을 주지 않는 경우에만 사용:

```typescript
// ✅ 허용 - 에러 핸들링 필수
this.notificationsService.create(userId, type, data)
  .catch(err => this.logger.error('알림 전송 실패', err));

// ❌ 잘못됨 - 에러가 무시됨
this.notificationsService.create(userId, type, data); // 에러 핸들링 없음
```

---

## 보안 관련 코드 작성 규칙

### 1. 사용자 인증 상태 변경

사용자 정지, 비밀번호 변경 등 인증 상태 변경 시:

```typescript
// ✅ 반드시 트랜잭션으로 원자적 처리
await this.prisma.$transaction(async (tx) => {
  // 1. 사용자 상태 변경
  await tx.user.update({ ... });

  // 2. 기존 세션 무효화
  await tx.refreshToken.deleteMany({ where: { userId } });

  // 3. 토큰 블랙리스트 추가
  await tx.tokenBlacklist.create({ data: { userId, ... } });
});
```

### 2. 파일 경로 처리

```typescript
// ✅ 올바름 - Path Traversal 방지
const filename = path.basename(userInput);
const filePath = path.resolve(baseDir, filename);
if (!filePath.startsWith(baseDir + path.sep)) {
  throw new BadRequestException('Invalid path');
}

// ❌ 잘못됨 - 취약점
const filePath = path.join(baseDir, userInput); // ../../../etc/passwd 가능
```

### 3. 외부 입력 검증

```typescript
// ✅ 올바름 - DTO와 ValidationPipe 사용
@Post()
async create(@Body() dto: CreatePostDto) {
  // dto는 class-validator로 검증됨
}

// ❌ 잘못됨 - 검증 없이 사용
@Post()
async create(@Body() body: any) {
  await this.prisma.post.create({ data: body }); // 위험!
}
```

### 4. 에러 응답

```typescript
// ✅ 올바름 - 일반적인 메시지
throw new NotFoundException('게시글을 찾을 수 없습니다');

// ❌ 잘못됨 - 내부 정보 노출
throw new InternalServerErrorException(`DB 에러: ${error.message}, 쿼리: ${query}`);
```

---

## 코드 리뷰 체크리스트

### 비동기 처리
- [ ] 모든 Prisma 메서드에 `await` 있음
- [ ] 모든 서비스 메서드 호출에 `await` 있음 (fire-and-forget 제외)
- [ ] 트랜잭션에 `await` 있음
- [ ] fire-and-forget 패턴에 `.catch()` 핸들러 있음

### 보안
- [ ] 파일 경로에 Path Traversal 검증 있음
- [ ] 사용자 입력이 DTO로 검증됨
- [ ] 에러 메시지에 민감한 정보 없음
- [ ] 인증 상태 변경 시 토큰 무효화 처리됨

### 일반
- [ ] 불필요한 `async` 키워드 없음 (await가 없으면 async 불필요)
- [ ] 에러 핸들링이 적절함
- [ ] 로깅이 적절함 (민감 정보 제외)

---

## ESLint 규칙 (권장)

`.eslintrc.js`에 다음 규칙 추가를 권장합니다:

```javascript
module.exports = {
  rules: {
    // async 함수에서 await 없으면 경고
    'require-await': 'warn',

    // Promise 반환 함수 호출 시 await/then 강제
    '@typescript-eslint/no-floating-promises': 'error',

    // Promise를 반환하는 함수는 async 또는 Promise 타입 명시
    '@typescript-eslint/promise-function-async': 'warn',
  },
};
```

---

## 참고 문서

- [SECURITY_CHANGELOG.md](./SECURITY_CHANGELOG.md) - 보안 수정 이력
- [Prisma Best Practices](https://www.prisma.io/docs/guides/performance-and-optimization)
- [NestJS Security](https://docs.nestjs.com/security/overview)
