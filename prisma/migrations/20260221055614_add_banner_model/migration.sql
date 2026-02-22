-- CreateEnum
CREATE TYPE "BannerType" AS ENUM ('PROMO', 'SIDEBAR');

-- CreateTable
CREATE TABLE "banners" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "linkUrl" TEXT,
    "alt" TEXT NOT NULL,
    "type" "BannerType" NOT NULL DEFAULT 'PROMO',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "banners_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "banners_type_isActive_idx" ON "banners"("type", "isActive");

-- CreateIndex
CREATE INDEX "banners_priority_idx" ON "banners"("priority");
