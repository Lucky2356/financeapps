-- CreateEnum
CREATE TYPE "LiabilityKind" AS ENUM ('CREDIT_CARD', 'LOAN', 'MORTGAGE', 'INSTALLMENT', 'OTHER');

-- CreateTable
CREATE TABLE "Liability" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "LiabilityKind" NOT NULL DEFAULT 'OTHER',
    "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "originalAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "interestRate" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "minPayment" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "dueDay" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Liability_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Liability_userId_idx" ON "Liability"("userId");

-- AddForeignKey
ALTER TABLE "Liability" ADD CONSTRAINT "Liability_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
