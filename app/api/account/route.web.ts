import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { verifyPassword } from "@/lib/auth/password";
import { apiErrorResponse } from "@/lib/api/route-errors";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/api/rate-limit";
import { requirePrisma } from "@/lib/prisma";
import { findCurrentUser } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

const schema = z.object({ password: z.string().min(1).max(200) });

// Permanently deletes the current user's account and all their data
// (152-ФЗ right to erasure). Requires the password as confirmation.
export async function DELETE(request: NextRequest) {
  try {
    const limit = rateLimit(`account-delete:${clientIp(request)}`, 5, 60_000);
    if (!limit.ok) return tooManyRequests(limit.retryAfter);

    const user = await findCurrentUser();
    if (!user) return NextResponse.json({ error: "Не авторизован." }, { status: 401 });
    if (!user.passwordHash)
      return NextResponse.json({ error: "У аккаунта нет пароля." }, { status: 400 });

    const { password } = schema.parse(await request.json());
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) return NextResponse.json({ error: "Пароль неверен." }, { status: 400 });

    const db = requirePrisma();
    // Transactions/recurring hold Restrict FKs to categories, so clear them
    // first; the user.delete cascade then removes everything else
    // (accounts, categories, budgets, goals, debts, rules, snapshots, …).
    await db.$transaction([
      db.transaction.deleteMany({ where: { userId: user.id } }),
      db.recurringTransaction.deleteMany({ where: { userId: user.id } }),
      db.user.delete({ where: { id: user.id } })
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error, "Не удалось удалить аккаунт.");
  }
}
