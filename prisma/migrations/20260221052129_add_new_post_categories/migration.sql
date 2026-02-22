-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PostCategory" ADD VALUE 'CLASS_MATERIAL';
ALTER TYPE "PostCategory" ADD VALUE 'CERTIFICATION';
ALTER TYPE "PostCategory" ADD VALUE 'SCHOOL_EVENT';
ALTER TYPE "PostCategory" ADD VALUE 'PARENT_COUNSEL';
ALTER TYPE "PostCategory" ADD VALUE 'TEACHER_DAYCARE';
ALTER TYPE "PostCategory" ADD VALUE 'TEACHER_SPECIAL';
ALTER TYPE "PostCategory" ADD VALUE 'TEACHER_KINDERGARTEN';
