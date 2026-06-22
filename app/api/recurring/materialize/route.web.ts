import { NextRequest, NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api/route-errors";
import { requirePrisma } from "@/lib/prisma";
import { findCurrentUser } from "@/lib/auth/current-user";
import { RecurringTransactionService } from "@/services/RecurringTransactionService";

export const dynamic = "force-dynamic";

async function defaultUser() {
  const user = await findCurrentUser();
  if (!user) throw new Error("Demo user not found. Run seed first.");
  return user;
}

function balanceDelta(type: "INCOME" | "EXPENSE", amount: number) {
  return type === "INCOME" ? amount : -amount;
}

export async function POST(request: NextRequest) {
  try {
    const db = requirePrisma();
    const user = await defaultUser();
    const { id } = (await request.json()) as { id?: string };

    if (!id)
      return NextResponse.json({ error: "Recurring transaction id is required." }, { status: 400 });

    const recurring = await db.recurringTransaction.findFirstOrThrow({
      where: { id, userId: user.id },
      include: { account: true, category: true }
    });
    if (!recurring.isActive)
      return NextResponse.json({ error: "Шаблон отключен." }, { status: 400 });

    const service = new RecurringTransactionService();
    const status = service.getStatus({
      nextDate: recurring.nextDate,
      frequency: recurring.frequency,
      isActive: recurring.isActive
    });

    if (!status.isDue) {
      return NextResponse.json({ created: 0, nextDate: recurring.nextDate.toISOString() });
    }

    const amount = Number(recurring.amount);
    await db.$transaction(async (tx) => {
      for (const dueDate of status.dueDates) {
        await tx.transaction.create({
          data: {
            userId: user.id,
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
        data: {
          nextDate: status.nextDateAfterRun,
          lastCreatedAt: new Date()
        }
      });
    });

    return NextResponse.json({
      created: status.dueDates.length,
      nextDate: status.nextDateAfterRun.toISOString()
    });
  } catch (error) {
    return apiErrorResponse(error, "Не удалось создать операции из шаблона.");
  }
}
