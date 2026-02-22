-- CreateEnum: JobType
CREATE TYPE "JobType" AS ENUM ('SPECIAL_EDUCATION', 'DAYCARE_TEACHER', 'KINDERGARTEN', 'CARE_TEACHER', 'STUDENT', 'DIRECTOR', 'LAWYER', 'OTHER');

-- AlterEnum: Remove TEACHER and LAWYER from UserRole
ALTER TYPE "UserRole" RENAME TO "UserRole_old";
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');
ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "role" TYPE "UserRole" USING ("role"::text::"UserRole");
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'USER';
DROP TYPE "UserRole_old";

-- AlterTable: Add jobType and career to users
ALTER TABLE "users" ADD COLUMN "jobType" "JobType",
ADD COLUMN "career" INTEGER;
