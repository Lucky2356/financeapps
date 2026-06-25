import { NextRequest, NextResponse } from "next/server";
import { startOfMonth } from "date-fns";

import { getBudgetsPageData } from "@/lib/data";
import { apiErrorResponse } from "@/lib/api/route-errors";
import { requirePrisma } from "@/lib/prisma";
import { findCurrentUser } from "@/lib/auth/current-user";
import { budgetSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const month = request.nextUrl.searchParams.get("month") ?? undefined;
  return NextResponse.json(await getBudgetsPageData(month));
}

export async function POST(request: NextRequest) {
  try {
    const db = requirePrisma();
    const user = await findCurrentUser();
    if (!user)
      return NextResponse.json({ error: "Demo user not found. Run seed first." }, { status: 404 });

    const input = budgetSchema.parse(await request.json());
    const category = await db.category.findFirst({
      where: { id: input.categoryId, userId: user.id, kind: "EXPENSE" }
    });
    if (!category) {
      return NextResponse.json(
        { error: "Выберите расходную категорию для бюджета." },
        { status: 400 }
      );
    }
    const month = input.month ? startOfMonth(new Date(`${input.month}-01`)) : startOfMonth(new Date());

    // A zero limit means "reset" — remove the budget for this month.
    if (input.limitAmount === 0) {
      await db.budget.deleteMany({
        where: { userId: user.id, categoryId: input.categoryId, month }
      });
      return NextResponse.json({ removed: true });
    }

    const budget = await db.budget.upsert({
      where: {
        userId_categoryId_month: { userId: user.id, categoryId: input.categoryId, month }
      },
      update: {
        limitAmount: input.limitAmount,
        ...(input.rollover !== undefined ? { rollover: input.rollover } : {})
      },
      create: {
        userId: user.id,
        categoryId: input.categoryId,
        month,
        limitAmount: input.limitAmount,
        rollover: input.rollover ?? false
      }
    });

    return NextResponse.json(budget);
  } catch (error) {
    return apiErrorResponse(error, "Не удалось сохранить бюджет.");
  }
}
