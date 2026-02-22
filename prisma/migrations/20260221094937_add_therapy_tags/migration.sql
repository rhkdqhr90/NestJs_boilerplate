-- CreateEnum
CREATE TYPE "TherapyTag" AS ENUM ('LANGUAGE', 'COGNITIVE', 'LEARNING', 'PLAY', 'SENSORY', 'MOTOR', 'ART', 'MUSIC');

-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "therapyTags" "TherapyTag"[] DEFAULT ARRAY[]::"TherapyTag"[];

-- CreateIndex
CREATE INDEX "posts_therapyTags_idx" ON "posts"("therapyTags");
