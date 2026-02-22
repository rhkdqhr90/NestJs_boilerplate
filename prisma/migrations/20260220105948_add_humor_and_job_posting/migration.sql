-- CreateEnum
CREATE TYPE "JobSubCategory" AS ENUM ('DAYCARE', 'KINDERGARTEN', 'SPECIAL_ED', 'HOME_TUTOR', 'ACADEMY', 'OTHER');

-- CreateEnum
CREATE TYPE "Region" AS ENUM ('SEOUL', 'BUSAN', 'DAEGU', 'INCHEON', 'GWANGJU', 'DAEJEON', 'ULSAN', 'SEJONG', 'GYEONGGI', 'GANGWON', 'CHUNGBUK', 'CHUNGNAM', 'JEONBUK', 'JEONNAM', 'GYEONGBUK', 'GYEONGNAM', 'JEJU');

-- CreateEnum
CREATE TYPE "SalaryType" AS ENUM ('MONTHLY', 'HOURLY', 'NEGOTIABLE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PostCategory" ADD VALUE 'HUMOR';
ALTER TYPE "PostCategory" ADD VALUE 'JOB_POSTING';

-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "isRecruiting" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "jobSubCategory" "JobSubCategory",
ADD COLUMN     "region" "Region",
ADD COLUMN     "salaryMax" INTEGER,
ADD COLUMN     "salaryMin" INTEGER,
ADD COLUMN     "salaryType" "SalaryType";

-- CreateIndex
CREATE INDEX "posts_jobSubCategory_idx" ON "posts"("jobSubCategory");

-- CreateIndex
CREATE INDEX "posts_region_idx" ON "posts"("region");
