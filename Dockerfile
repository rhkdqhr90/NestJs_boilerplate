# Stage 1: Dependencies
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# pnpm 설치
RUN corepack enable && corepack prepare pnpm@10.22.0 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Stage 2: Builder
FROM node:22-alpine AS builder
RUN apk add --no-cache openssl
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.22.0 --activate

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Prisma Client 생성
RUN pnpm prisma generate

# 빌드
RUN pnpm build

# Stage 3: Runner
FROM node:22-alpine AS runner
RUN apk add --no-cache openssl
WORKDIR /app

ENV NODE_ENV=production

# 비루트 사용자 생성
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nestjs

# 필요한 파일만 복사
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma

# uploads 디렉토리 생성 및 권한 설정
RUN mkdir -p uploads/verification uploads/profiles && \
    chown -R nestjs:nodejs uploads

USER nestjs

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

CMD ["node", "dist/main.js"]
