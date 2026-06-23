import { NextResponse } from "next/server";

import { findCurrentUser } from "@/lib/auth/current-user";
import { apiErrorResponse } from "@/lib/api/route-errors";
import { getInvestmentData } from "@/lib/data";
import { computeNetWorth } from "@/lib/net-worth";
import { isoDay } from "@/lib/net-worth-snapshots";
import { requirePrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Records today's net worth snapshot for the current user (idempotent per day,
// plan B7). Called once on app load by the automation runner.
export async function POST() {
  try {
    const user = await findCurrentUser();
    if (!user) return NextResponse.json({ error: "Требуется вход." }, { status: 401 });

    const db = requirePrisma();
    const [accounts, goals, liabilities, investments] = await Promise.all([
      db.account.aggregate({
        _sum: { balance: true },
        where: { userId: user.id, isArchived: false }
      }),
      db.savingGoal.aggregate({ _sum: { currentAmount: true }, where: { userId: user.id } }),
      db.liability.aggregate({ _sum: { balance: true }, where: { userId: user.id } }),
      getInvestmentData()
    ]);

    const value = computeNetWorth({
      totalBalance: Number(accounts._sum.balance ?? 0),
      portfolioValue: investments.portfolio.reduce((sum, p) => sum + p.currentValue, 0),
      goalSavings: Number(goals._sum.currentAmount ?? 0),
      liabilitiesTotal: Number(liabilities._sum.balance ?? 0)
    });

    const date = isoDay(new Date());
    await db.netWorthSnapshot.upsert({
      where: { userId_date: { userId: user.id, date } },
      update: { value },
      create: { userId: user.id, date, value }
    });

    return NextResponse.json({ recorded: true, value });
  } catch (error) {
    return apiErrorResponse(error, "Не удалось сохранить снимок капитала.");
  }
}
