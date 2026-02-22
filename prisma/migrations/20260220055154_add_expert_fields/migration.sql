-- CreateEnum
CREATE TYPE "ExpertType" AS ENUM ('LAWYER', 'LEGAL_CONSULTANT');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "expertType" "ExpertType",
ADD COLUMN     "expertVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "isExpert" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "answers" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "isBest" BOOLEAN NOT NULL DEFAULT false,
    "bestSelectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "answers_postId_idx" ON "answers"("postId");

-- CreateIndex
CREATE INDEX "answers_authorId_idx" ON "answers"("authorId");

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
