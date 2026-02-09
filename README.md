# NestJS Boilerplate

**Production-ready NestJS boilerplate with best practices**

[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql)](https://www.postgresql.org/)

---

## 🚀 Features

### Core

- ✅ **NestJS 11** - Progressive Node.js framework
- ✅ **TypeScript 5.7** - Type-safe development
- ✅ **Prisma 6** - Next-generation ORM
- ✅ **PostgreSQL 16** - Production database
- ✅ **Redis 7** - Caching & session (optional)
- ✅ **pnpm** - Fast package manager

### Security

- ✅ **Helmet.js** - Security headers (XSS, CSP, etc.)
- ✅ **CORS** - Whitelist configuration
- ✅ **Rate Limiting** - DDoS protection (Throttler)
- ✅ **Input Validation** - class-validator + DTO
- ✅ **Environment Validation** - Joi schema
- ✅ **SQL Injection Protection** - Prisma ORM

### Architecture

- ✅ **Layered Architecture** - Controller → Service → Repository
- ✅ **Exception Filters** - Standardized error responses
- ✅ **Interceptors** - Request/Response transformation & logging
- ✅ **Guards** - Authentication & Authorization (ready)
- ✅ **Pipes** - Validation & Transformation
- ✅ **Winston Logger** - Production logging

### Developer Experience

- ✅ **ESLint** - Code quality
- ✅ **Prettier** - Code formatting
- ✅ **Docker Compose** - One-command setup
- ✅ **Hot Reload** - Fast development
- ✅ **Git Hooks** - Pre-commit checks (ready)

---

## 📋 Prerequisites

- **Node.js** 20+ (v22 recommended)
- **pnpm** 8+
- **Docker** & **Docker Compose**
- **Git**

---

## 🛠️ Quick Start

### 1. Clone & Install

```bash
# Clone repository
git clone <your-repo-url>
cd nestjs-boilerplate

# Install dependencies
pnpm install
```

### 2. Environment Setup

```bash
# Copy environment template
cp .env.example .env

# Generate strong secrets
# Linux/Mac:
openssl rand -base64 64

# Update .env with your values
```

**Required environment variables:**

```env
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/boilerplate_db

# JWT (must be 32+ characters)
JWT_SECRET=your-super-secret-key-at-least-32-characters-long
REFRESH_TOKEN_SECRET=your-refresh-secret-key-at-least-32-characters-long

ALLOWED_ORIGINS=http://localhost:3000
```

### 3. Start Database

```bash
# Start PostgreSQL & Redis
docker-compose up -d

# Verify containers
docker ps
```

### 4. Database Migration

```bash
# Run migrations
npx prisma migrate dev

# (Optional) View database in Prisma Studio
npx prisma studio
```

### 5. Start Development Server

```bash
pnpm start:dev
```

**Server runs on:** `http://localhost:3000`

**Health check:** `http://localhost:3000/api/health`

---

## 📂 Project Structure

```
nestjs-boilerplate/
├── src/
│   ├── common/              # Shared modules
│   │   ├── filters/         # Exception filters
│   │   ├── interceptors/    # Request/Response interceptors
│   │   ├── guards/          # Auth guards (ready)
│   │   ├── decorators/      # Custom decorators (ready)
│   │   └── pipes/           # Validation pipes
│   │
│   ├── config/              # Configuration
│   │   ├── configuration.ts
│   │   ├── validation.schema.ts
│   │   └── winston.config.ts
│   │
│   ├── database/            # Database
│   │   └── prisma.service.ts
│   │
│   ├── modules/             # Feature modules
│   │   ├── auth/            # (Next: Day 2)
│   │   ├── users/           # (Next: Day 2)
│   │   └── posts/           # (Next: Day 3)
│   │
│   ├── app.module.ts
│   └── main.ts
│
├── prisma/
│   ├── schema.prisma        # Database schema
│   └── migrations/          # Migration history
│
├── docker-compose.yml       # Docker services
├── .env.example             # Environment template
└── README.md
```

---

## 🔧 Available Scripts

```bash
# Development
pnpm start:dev              # Start with hot-reload

# Build
pnpm build                  # Production build
pnpm start:prod             # Run production build

# Testing
pnpm test                   # Unit tests
pnpm test:e2e               # E2E tests
pnpm test:cov               # Coverage report

# Code Quality
pnpm lint                   # ESLint
pnpm format                 # Prettier

# Database
npx prisma migrate dev      # Create & apply migration
npx prisma studio           # Database GUI
npx prisma generate         # Generate Prisma Client
```

---

## 🎯 API Endpoints

### Health Check

**GET** `/api/health`

**Response:**

```json
{
  "data": {
    "status": "ok",
    "timestamp": "2026-02-09T...",
    "uptime": 123.45
  },
  "timestamp": "2026-02-09T...",
  "path": "/api/health"
}
```

### Error Response Format

```json
{
  "statusCode": 400,
  "timestamp": "2026-02-09T...",
  "path": "/api/...",
  "method": "POST",
  "message": "Validation failed",
  "errors": [
    {
      "field": "email",
      "message": "email must be an email"
    }
  ]
}
```

---

## 🔒 Security Features

### 1. Environment Validation

- Server won't start with invalid config
- JWT_SECRET must be 32+ characters
- All required vars must be present

### 2. Input Validation

```typescript
// Automatic validation via DTO
class CreateUserDto {
  @IsEmail()
  email: string;

  @MinLength(8)
  password: string;
}
```

### 3. Rate Limiting

- Global: 10 requests/second
- Custom per-endpoint limits available

### 4. CORS Whitelist

- Only allowed origins can access API
- Configured in `.env`

### 5. Security Headers (Helmet.js)

- XSS Protection
- Content Security Policy
- HSTS
- Frame Options

---

## 📝 Database Schema

```prisma
model User {
  id         String   @id @default(cuid())
  email      String   @unique
  password   String
  nickname   String
  role       UserRole @default(USER)
  isVerified Boolean  @default(false)

  posts      Post[]
  comments   Comment[]

  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
}

model Post {
  id          String   @id @default(cuid())
  title       String
  content     String
  isAnonymous Boolean  @default(false)

  authorId    String?
  author      User?
  comments    Comment[]

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

---

## 🚢 Deployment

### Docker Production Build

```bash
# Build image
docker build -t nestjs-boilerplate .

# Run container
docker run -p 3000:3000 --env-file .env nestjs-boilerplate
```

### Environment Variables (Production)

**Critical:**

- Set strong `JWT_SECRET` (64+ characters)
- Use production database URL
- Enable HTTPS
- Update `ALLOWED_ORIGINS`

---

## 🔄 Next Steps

### Day 2: Authentication

- [ ] JWT Authentication
- [ ] Refresh Token
- [ ] Password Hashing (bcrypt)
- [ ] Auth Guards
- [ ] Users Module

### Day 3: Core Features

- [ ] Posts Module
- [ ] Comments Module
- [ ] Swagger Documentation
- [ ] Unit Tests
- [ ] E2E Tests

### Phase 2: Advanced

- [ ] Redis Caching
- [ ] File Upload
- [ ] Email Service
- [ ] Role-Based Access Control
- [ ] API Versioning

---

## 📚 Documentation

- **Architecture:** [ARCHITECTURE.md](./docs/ARCHITECTURE.md)
- **Security:** [SECURITY.md](./docs/SECURITY.md)
- **API Standards:** [API_STANDARDS.md](./docs/API_STANDARDS.md)
- **Development Guide:** [DEVELOPMENT_GUIDE.md](./docs/DEVELOPMENT_GUIDE.md)
- **Progress:** [PROGRESS.md](./docs/PROGRESS.md)

---

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing`)
3. Commit changes (`git commit -m 'feat: Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing`)
5. Open Pull Request

**Commit Convention:**

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation
- `refactor:` Code refactoring
- `test:` Tests
- `chore:` Build/config

---

## 📄 License

MIT License - feel free to use this boilerplate for any project.

---

## 🙏 Acknowledgments

- [NestJS](https://nestjs.com/) - Framework
- [Prisma](https://www.prisma.io/) - ORM
- [TypeScript](https://www.typescriptlang.org/) - Language

---

**Built with ❤️ by CTO**

**Status:** Production-Ready ✅
