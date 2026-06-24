import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api/route-errors";
import { requirePrisma } from "@/lib/prisma";
import { findCurrentUser } from "@/lib/auth/current-user";
import { materializeRecurringTx } from "@/lib/recurring/materialize";
import { RecurringTransactionService } from "@/services/RecurringTransactionService";

export const dynamic = "force-dynamic";

// Batch auto-posting: materializes every active, currently-due recurring template
// for the user in a single transaction. Backs the `autoMaterializeRecurring`
// setting on app load (web parity with the desktop LocalApiClient).
export async function POST() {
  try {
    const db = requirePrisma();
    const user = await findCurrentUser();
    if (!user)
      return NextResponse.json({ error: "Demo user not found. Run seed first." }, { status: 404 });

    const recurring = await db.recurringTransaction.findMany({
      where: { userId: user.id, isActive: true }
    });

    const service = new RecurringTransactionService();
    const result = await db.$transaction(async (tx) => {
      let created = 0;
      let templates = 0;
      for (const item of recurring) {
        const outcome = await materializeRecurringTx(tx, item, service);
        if (outcome.created > 0) {
          created += outcome.created;
          templates += 1;
        }
      }
      return { created, templates };
    });

    return NextResponse.json(result);
  } catch (error) {
    return apiErrorResponse(error, "Не удалось провести регулярные платежи.");
  }
}
