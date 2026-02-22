-- AlterTable
ALTER TABLE "verification_requests" ADD COLUMN     "isEncrypted" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "verification_access_logs" (
    "id" TEXT NOT NULL,
    "verificationRequestId" TEXT NOT NULL,
    "accessedById" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "verification_access_logs_verificationRequestId_idx" ON "verification_access_logs"("verificationRequestId");

-- CreateIndex
CREATE INDEX "verification_access_logs_accessedById_idx" ON "verification_access_logs"("accessedById");

-- CreateIndex
CREATE INDEX "verification_access_logs_createdAt_idx" ON "verification_access_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "verification_access_logs" ADD CONSTRAINT "verification_access_logs_verificationRequestId_fkey" FOREIGN KEY ("verificationRequestId") REFERENCES "verification_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_access_logs" ADD CONSTRAINT "verification_access_logs_accessedById_fkey" FOREIGN KEY ("accessedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
