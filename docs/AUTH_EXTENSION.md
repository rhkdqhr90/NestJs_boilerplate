# Auth Module 확장 가이드

**작성일:** 2026.02.13  
**상태:** Phase 1 완료, Phase 2 준비 완료

---

## 현재 상태 (Phase 1)

### ✅ 구현된 기능
- Local 인증 (Email/Password)
- JWT + Refresh Token
- Token Rotation
- Logout 무효화
- Rate Limiting

### ✅ 확장 준비 완료
- User 모델: `provider`, `providerId` 필드 추가
- password: nullable (OAuth 사용자용)
- Auth Service: 확장 포인트 표시

---

## Phase 2: OAuth2 추가 방법

### 필요한 패키지
```bash
pnpm add passport-google-oauth20 passport-github2
pnpm add -D @types/passport-google-oauth20 @types/passport-github2
```

### 구현 단계
1. Google/GitHub Strategy 생성
2. Auth Service의 TODO 주석 해제
3. Controller에 OAuth 엔드포인트 추가
4. Module에 Strategy 등록

### 자세한 구현
`src/auth/auth.service.ts`의 주석 참고:
- `googleLogin()`
- `githubLogin()`
- `findOrCreateOAuthUser()`

---

## Phase 2: 이메일 인증 추가 방법

### 필요한 패키지
```bash
pnpm add nodemailer
pnpm add -D @types/nodemailer
```

### 구현 단계
1. EmailVerification 모델 추가 (Prisma)
2. Email Service 생성
3. 인증 코드 생성/검증 로직
4. Controller 엔드포인트 추가

---

## 충돌 방지

### ✅ 이미 처리됨
- User.password nullable
- User.provider, providerId 필드
- OAuth 사용자 비밀번호 로그인 차단

### 주의사항
- 기존 유저는 provider='local' 자동 설정됨
- email은 여전히 unique (provider별로 구분 안 됨)
- 필요 시 @@unique([email, provider]) 변경 고려

---

**작성자:** CTO  
**다음:** Phase 2 구현 시 상세 가이드 업데이트
