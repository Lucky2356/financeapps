import type { Prisma, RecurringTransaction } from "@prisma/client";

import { RecurringTransactionService } from "@/services/RecurringTransactionService";

function balanceDelta(type: "INCOME" | "EXPENSE", amount: number) {
  return type === "INCOME" ? amount : -amount;
}

type MaterializableRecurring = Pick<
  RecurringTransaction,
  | "id"
  | "userId"
  | "accountId"
  | "categoryId"
  | "amount"
  | "type"
  | "frequency"
  | "nextDate"
  | "isActive"
  | "description"
>;

// Posts all currently-due occurrences of one recurring template inside an open
// Prisma transaction: creates the transactions, moves the account balance, and
// advances nextDate/lastCreatedAt. Returns how many were created and the new
// nextDate. Shared by the single (/recurring/materialize) and batch
// (/recurring/materialize-all) web routes so the logic stays in one place.
export async function materializeRecurringTx(
  tx: Prisma.TransactionClient,
  recurring: MaterializableRecurring,
  service: RecurringTransactionService
): Promise<{ created: number; nextDate: Date }> {
  const status = service.getStatus({
    nextDate: recurring.nextDate,
    frequency: recurring.frequency,
    isActive: recurring.isActive
  });

  if (!status.isDue) {
    return { created: 0, nextDate: recurring.nextDate };
  }

  const amount = Number(recurring.amount);
  for (const dueDate of status.dueDates) {
    await tx.transaction.create({
      data: {
        userId: recurring.userId,
        accountId: recurring.accountId,
        categoryId: recurring.categoryId,
        amount,
        type: recurring.type,
        date: dueDate,
        description: recurring.description
      }
    });
    await tx.account.update({
      where: { id: recurring.accountId },
      data: { balance: { increment: balanceDelta(recurring.type, amount) } }
    });
  }

  await tx.recurringTransaction.update({
    where: { id: recurring.id },
    data: { nextDate: status.nextDateAfterRun, lastCreatedAt: new Date() }
  });

  return { created: status.dueDates.length, nextDate: status.nextDateAfterRun };
}
