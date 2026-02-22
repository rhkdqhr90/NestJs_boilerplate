-- AlterTable
ALTER TABLE "email_verification_tokens" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "maxAttempts" INTEGER NOT NULL DEFAULT 5;
