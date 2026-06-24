-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "importBatchId" TEXT;

-- CreateIndex
CREATE INDEX "Transaction_userId_importBatchId_idx" ON "Transaction"("userId", "importBatchId");
