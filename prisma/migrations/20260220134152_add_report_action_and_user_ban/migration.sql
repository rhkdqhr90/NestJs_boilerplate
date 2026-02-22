-- CreateEnum
CREATE TYPE "ReportAction" AS ENUM ('NONE', 'WARNING', 'POST_DELETE', 'COMMENT_DELETE', 'USER_BAN_1DAY', 'USER_BAN_7DAYS', 'USER_BAN_30DAYS', 'USER_BAN_PERMANENT');

-- AlterTable
ALTER TABLE "reports" ADD COLUMN     "action" "ReportAction" NOT NULL DEFAULT 'NONE';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "banReason" TEXT,
ADD COLUMN     "bannedAt" TIMESTAMP(3),
ADD COLUMN     "bannedUntil" TIMESTAMP(3),
ADD COLUMN     "isBanned" BOOLEAN NOT NULL DEFAULT false;
