# NestJS Boilerplate

**프로덕션 레벨의 NestJS 보일러플레이트 - 보안, 인증, 게시판 기능 완비**

[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql)](https://www.postgresql.org/)

---

## 🚀 주요 기능

### 핵심 기술 스택

- ✅ **NestJS 11** - 프로그레시브 Node.js 프레임워크
- ✅ **TypeScript 5.7** - 타입 안전성 보장
- ✅ **Prisma 6** - 차세대 ORM
- ✅ **PostgreSQL 16** - 프로덕션 데이터베이스
- ✅ **Redis 7** - 캐싱 및 세션 (선택)
- ✅ **pnpm** - 빠른 패키지 매니저

### 인증 및 권한

- ✅ **JWT 인증** - Access Token + Refresh Token
- ✅ **비밀번호 암호화** - bcrypt (salt rounds: 10)
- ✅ **이메일 인증** - 회원가입 시 인증 메일 발송
- ✅ **토큰 관리** - 자동 갱신, 블랙리스트 관리
- ✅ **역할 기반 권한** - USER, ADMIN
- ✅ **Auth Guards** - JWT, Refresh Token 가드

### 보안

- ✅ **Helmet.js** - XSS, CSP 등 보안 헤더
- ✅ **CORS** - 화이트리스트 설정
- ✅ **Rate Limiting** - DDoS 방어 (Throttler)
  - 게시글 작성: 10회/분
  - 게시글 조회: 20회/분
  - 좋아요: 30회/분
  - 댓글 작성: 30회/분
  - 댓글 수정: 20회/분
  - 댓글 조회: 100회/분
  - 댓글 삭제: 10회/분
- ✅ **입력 검증** - class-validator + DTO
- ✅ **XSS 방어** - sanitize-html을 통한 입력 정제
- ✅ **SQL Injection 방어** - Prisma ORM + 동적 필드 검증
- ✅ **Trust Proxy** - 프록시 환경에서 실제 클라이언트 IP 추출
- ✅ **익명 게시글 보호** - IP 해싱을 통한 익명성 보장

### 게시판 기능 (Posts & Comments)

- ✅ **게시글 CRUD** - 작성, 조회, 수정, 삭제
- ✅ **익명 게시글** - IP 기반 익명 작성 지원
- ✅ **카테고리 분류** - 자유게시판, 질문게시판, 공지사항
- ✅ **좋아요 기능** - 중복 방지, 카운트 관리
- ✅ **조회수 추적** - IP 기반 중복 방지
- ✅ **페이지네이션** - 커서 기반, DOS 공격 방지
- ✅ **검색 기능** - 제목, 내용 검색
- ✅ **정렬 기능** - 최신순, 조회수순, 좋아요순
- ✅ **댓글 시스템** - 1-depth 대댓글, 멘션 기능
- ✅ **댓글 페이지네이션** - 최대 100개 제한

### 아키텍처

- ✅ **계층형 아키텍처** - Controller → Service → Repository
- ✅ **Exception Filters** - 표준화된 에러 응답
- ✅ **Interceptors** - 요청/응답 변환 및 로깅
- ✅ **Guards** - 인증 및 권한 검사
- ✅ **Pipes** - 검증 및 변환
- ✅ **Winston Logger** - 프로덕션 로깅

### 개발자 경험

- ✅ **ESLint** - 코드 품질 관리
- ✅ **Prettier** - 코드 포맷팅
- ✅ **Docker Compose** - 원클릭 환경 구성
- ✅ **Hot Reload** - 빠른 개발 환경
- ✅ **타입 안전성** - Express Request 타입 확장

---

## 📋 사전 요구사항

- **Node.js** 20+ (v22 권장)
- **pnpm** 8+
- **Docker** & **Docker Compose**
- **Git**

---

## 🛠️ 빠른 시작

### 1. 클론 및 설치

```bash
# 저장소 클론
git clone <your-repo-url>
cd nestjs-boilerplate

# 의존성 설치
pnpm install
```

### 2. 환경 변수 설정

```bash
# 환경 변수 템플릿 복사
cp .env.example .env

# 강력한 시크릿 키 생성 (Linux/Mac)
openssl rand -base64 64

# .env 파일 수정
```


---

## 🔒 보안 기능 상세

### 1. 환경 변수 검증

- 서버는 잘못된 설정으로 시작되지 않음
- JWT_SECRET은 32자 이상 필수
- 모든 필수 변수가 존재해야 함

### 2. 입력 검증

```typescript
// DTO를 통한 자동 검증
class CreatePostDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Transform(sanitizeTitle)
  title: string;

  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  @Transform(sanitizeContent)
  content: string;
}
```

### 3. XSS 방어

- 제목: 모든 HTML 태그 제거
- 내용: `<b>`, `<i>`, `<u>`, `<p>`, `<br>`, `<ul>`, `<ol>`, `<li>` 허용
- 댓글: `<b>`, `<i>`, `<u>`, `<strong>`, `<em>` 허용
- `discard` 모드 사용으로 이중 디코딩 공격 방어

### 4. SQL Injection 방어

```typescript
// 동적 필드 화이트리스트 검증
const allowedSortFields: Record<string, boolean> = {
  createdAt: true,
  viewCount: true,
  likeCount: true,
};

if (!allowedSortFields[sort]) {
  throw new BadRequestException('잘못된 정렬 필드입니다');
}
```

### 5. Rate Limiting

엔드포인트별 세밀한 제한:
- 게시글 작성: 10회/분 (스팸 방지)
- 게시글 조회: 20회/분 (크롤링 방지)
- 좋아요: 30회/분 (어뷰징 방지)
- 댓글 작성: 30회/분
- 댓글 수정: 20회/분
- 댓글 조회: 100회/분
- 댓글 삭제: 10회/분

### 6. CORS 화이트리스트

- 허용된 출처만 API 접근 가능
- `.env`에서 설정

### 7. 보안 헤더 (Helmet.js)

- XSS Protection
- Content Security Policy
- HSTS
- Frame Options

### 8. 익명 게시글 보호

- IP를 SHA256으로 해싱하여 저장
- 익명 게시글 삭제 시 IP 해시 비교
- 원본 IP는 저장하지 않음

### 9. DOS 공격 방어

- 페이지네이션 최대 페이지: 1000
- 페이지당 최대 항목: 100
- 검색어 최대 길이: 100자

---


## 🚢 배포

### Docker 프로덕션 빌드

```bash
# 이미지 빌드
docker build -t nestjs-boilerplate .

# 컨테이너 실행
docker run -p 3000:3000 --env-file .env nestjs-boilerplate
```

### 프로덕션 환경 변수

**필수 설정:**

- 강력한 `JWT_SECRET` 설정 (64자 이상 권장)
- 프로덕션 데이터베이스 URL 사용
- HTTPS 활성화
- `ALLOWED_ORIGINS` 업데이트
- `trust proxy` 설정 확인

---

## ✅ 완료된 기능

### 인증 시스템 ✅


### 사용자 모듈 ✅


### 게시글 모듈 ✅


### 댓글 모듈 ✅

---

## 🔄 향후 개선 사항

### Phase 2: 고급 기능

- [ ] Redis 캐싱 통합
- [ ] 파일 업로드 (이미지, 첨부파일)
- [ ] 이메일 서비스 (실제 메일 발송)
- [ ] 실시간 알림 (WebSocket)
- [ ] Swagger 문서화
- [ ] 단위 테스트 및 E2E 테스트
- [ ] API 버전 관리
- [ ] 통계 및 분석 대시보드

---

## 🤝 기여하기

1. 저장소 Fork
2. 기능 브랜치 생성 (`git checkout -b feature/amazing`)
3. 변경사항 커밋 (`git commit -m 'feat: 놀라운 기능 추가'`)
4. 브랜치 푸시 (`git push origin feature/amazing`)
5. Pull Request 생성

**커밋 컨벤션:**

- `feat:` 새로운 기능
- `fix:` 버그 수정
- `docs:` 문서 수정
- `refactor:` 코드 리팩토링
- `test:` 테스트 코드
- `chore:` 빌드/설정

---

## 📄 라이선스

MIT License - 이 보일러플레이트는 자유롭게 사용 가능합니다.

---

## 🙏 감사의 말

- [NestJS](https://nestjs.com/) - 프레임워크
- [Prisma](https://www.prisma.io/) - ORM
- [TypeScript](https://www.typescriptlang.org/) - 언어

---

**Status:** 프로덕션 준비 완료 ✅

**Last Updated:** 2026-02-13
