-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('PENDING', 'REVIEWING', 'ACCEPTED', 'REJECTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "benefits" TEXT,
ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "contactKakao" TEXT,
ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "deadline" TIMESTAMP(3),
ADD COLUMN     "detailAddress" TEXT,
ADD COLUMN     "employmentType" "EmploymentType",
ADD COLUMN     "isAutoClose" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "organizationName" TEXT,
ADD COLUMN     "recruitCount" INTEGER,
ADD COLUMN     "requirements" TEXT,
ADD COLUMN     "workingHours" TEXT;

-- CreateTable
CREATE TABLE "applications" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "coverLetter" TEXT,
    "resumeUrl" TEXT,
    "resumeFileName" TEXT,
    "recruiterNote" TEXT,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "applications_postId_idx" ON "applications"("postId");

-- CreateIndex
CREATE INDEX "applications_applicantId_idx" ON "applications"("applicantId");

-- CreateIndex
CREATE INDEX "applications_status_idx" ON "applications"("status");

-- CreateIndex
CREATE INDEX "applications_createdAt_idx" ON "applications"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "applications_postId_applicantId_key" ON "applications"("postId", "applicantId");

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
