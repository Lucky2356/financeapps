import { NextRequest, NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api/route-errors";
import { requirePrisma } from "@/lib/prisma";
import { findCurrentUser } from "@/lib/auth/current-user";
import { materializeRecurringTx } from "@/lib/recurring/materialize";
import { RecurringTransactionService } from "@/services/RecurringTransactionService";

export const dynamic = "force-dynamic";

async function defaultUser() {
  const user = await findCurrentUser();
  if (!user) throw new Error("Demo user not found. Run seed first.");
  return user;
}

export async function POST(request: NextRequest) {
  try {
    const db = requirePrisma();
    const user = await defaultUser();
    const { id } = (await request.json()) as { id?: string };

    if (!id)
      return NextResponse.json({ error: "Recurring transaction id is required." }, { status: 400 });

    const recurring = await db.recurringTransaction.findFirstOrThrow({
      where: { id, userId: user.id }
    });
    if (!recurring.isActive)
      return NextResponse.json({ error: "Шаблон отключен." }, { status: 400 });

    const service = new RecurringTransactionService();
    const result = await db.$transaction((tx) => materializeRecurringTx(tx, recurring, service));

    return NextResponse.json({
      created: result.created,
      nextDate: result.nextDate.toISOString()
    });
  } catch (error) {
    return apiErrorResponse(error, "Не удалось создать операции из шаблона.");
  }
}
