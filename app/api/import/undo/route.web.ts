import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api/route-errors";
import { requirePrisma } from "@/lib/prisma";
import { findCurrentUser } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

function balanceDelta(type: "INCOME" | "EXPENSE", amount: number) {
  return type === "INCOME" ? amount : -amount;
}

// Undoes the most recent CSV import for the current user: deletes every
// transaction stamped with the latest importBatchId and reverts the affected
// account balances. Web parity with the desktop LocalApiClient undo.
export async function POST() {
  try {
    const db = requirePrisma();
    const user = await findCurrentUser();
    if (!user)
      return NextResponse.json({ error: "Demo user not found. Run seed first." }, { status: 404 });

    // The batch id of the most recently imported transaction.
    const latest = await db.transaction.findFirst({
      where: { userId: user.id, importBatchId: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { importBatchId: true }
    });

    const batchId = latest?.importBatchId;
    if (!batchId) {
      return NextResponse.json({ removed: 0 });
    }

    const batch = await db.transaction.findMany({
      where: { userId: user.id, importBatchId: batchId },
      select: { id: true, accountId: true, amount: true, type: true }
    });

    // Aggregate the balance impact per account so each account updates once.
    const perAccount = new Map<string, number>();
    for (const item of batch) {
      const delta = balanceDelta(item.type, Number(item.amount));
      perAccount.set(item.accountId, (perAccount.get(item.accountId) ?? 0) + delta);
    }

    await db.$transaction(async (tx) => {
      await tx.transaction.deleteMany({ where: { userId: user.id, importBatchId: batchId } });
      for (const [accountId, delta] of perAccount) {
        await tx.account.update({
          where: { id: accountId },
          data: { balance: { decrement: delta } }
        });
      }
    });

    return NextResponse.json({ removed: batch.length });
  } catch (error) {
    return apiErrorResponse(error, "Не удалось отменить последний импорт.");
  }
}
