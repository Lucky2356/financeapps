import { NextRequest, NextResponse } from "next/server";

import { getGoalsPageData } from "@/lib/data";
import { apiErrorResponse } from "@/lib/api/route-errors";
import { requirePrisma } from "@/lib/prisma";
import { savingGoalSchema } from "@/lib/validations";

export const dynamic = "force-static";

export async function GET() {
  return NextResponse.json(await getGoalsPageData());
}

// Top up a goal, optionally debiting a real account (mirrors LocalApiClient):
// records a "Накопления" expense and grows the goal. Net worth stays conserved
// because goal savings count toward it.
async function depositToGoal(
  db: ReturnType<typeof requirePrisma>,
  userId: string,
  body: { goalId?: unknown; amount?: unknown; accountId?: unknown }
) {
  const goalId = String(body.goalId ?? "");
  const amount = Number(body.amount);
  const accountId = body.accountId ? String(body.accountId) : "";
  if (!goalId) return NextResponse.json({ error: "Goal id is required." }, { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "Введите сумму больше нуля." }, { status: 400 });

  const goal = await db.savingGoal.findFirst({ where: { id: goalId, userId } });
  if (!goal) return NextResponse.json({ error: "Цель не найдена." }, { status: 404 });

  let categoryId: string | null = null;
  if (accountId) {
    const existing = await db.category.findFirst({
      where: { userId, name: { equals: "Накопления", mode: "insensitive" }, kind: "EXPENSE" }
    });
    const category =
      existing ??
      (await db.category.create({
        data: { userId, name: "Накопления", kind: "EXPENSE", color: "#0d9488", icon: "PiggyBank" }
      }));
    categoryId = category.id;
  }

  const updated = await db.$transaction(async (tx) => {
    if (accountId && categoryId) {
      const account = await tx.account.findFirst({ where: { id: accountId, userId, isArchived: false } });
      if (!account) throw new Error("Выберите существующий активный счёт.");
      await tx.transaction.create({
        data: { userId, accountId: account.id, categoryId, amount, type: "EXPENSE", date: new Date(), description: `Пополнение цели: ${goal.title}` }
      });
      await tx.account.update({ where: { id: account.id }, data: { balance: { decrement: amount } } });
    }
    return tx.savingGoal.update({ where: { id: goal.id }, data: { currentAmount: { increment: amount } } });
  });

  return NextResponse.json(updated);
}

export async function POST(request: NextRequest) {
  try {
    const db = requirePrisma();
    const user = await db.user.findFirst({ orderBy: { createdAt: "asc" } });
    if (!user) return NextResponse.json({ error: "Demo user not found. Run seed first." }, { status: 404 });

    const body = await request.json();
    if (body?.action === "deposit") {
      return await depositToGoal(db, user.id, body);
    }

    const input = savingGoalSchema.parse(body);
    const goal = await db.savingGoal.create({
      data: {
        userId: user.id,
        title: input.title,
        targetAmount: input.targetAmount,
        currentAmount: input.currentAmount,
        deadline: new Date(input.deadline)
      }
    });

    return NextResponse.json(goal, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, "Не удалось создать цель.");
  }
}

export async function PUT(request: NextRequest) {
  try {
    const db = requirePrisma();
    const user = await db.user.findFirst({ orderBy: { createdAt: "asc" } });
    if (!user) return NextResponse.json({ error: "Demo user not found. Run seed first." }, { status: 404 });
    const input = savingGoalSchema.parse(await request.json());

    if (!input.id) {
      return NextResponse.json({ error: "Goal id is required." }, { status: 400 });
    }

    const goal = await db.savingGoal.update({
      where: { id: input.id, userId: user.id },
      data: {
        title: input.title,
        targetAmount: input.targetAmount,
        currentAmount: input.currentAmount,
        deadline: new Date(input.deadline)
      }
    });

    return NextResponse.json(goal);
  } catch (error) {
    return apiErrorResponse(error, "Не удалось обновить цель.");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const db = requirePrisma();
    const user = await db.user.findFirst({ orderBy: { createdAt: "asc" } });
    if (!user) return NextResponse.json({ error: "Demo user not found. Run seed first." }, { status: 404 });
    const id = request.nextUrl.searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Goal id is required." }, { status: 400 });
    }

    await db.savingGoal.delete({ where: { id, userId: user.id } });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return apiErrorResponse(error, "Не удалось удалить цель.");
  }
}
