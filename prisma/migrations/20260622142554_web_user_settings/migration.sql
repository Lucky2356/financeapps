-- AlterTable
ALTER TABLE "User" ADD COLUMN     "aiApiKey" TEXT,
ADD COLUMN     "aiEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "aiModel" TEXT,
ADD COLUMN     "autoMaterializeRecurring" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "defaultTransactionType" "TransactionType" NOT NULL DEFAULT 'EXPENSE',
ADD COLUMN     "density" TEXT NOT NULL DEFAULT 'comfortable',
ADD COLUMN     "paymentReminders" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "theme" TEXT NOT NULL DEFAULT 'system';
