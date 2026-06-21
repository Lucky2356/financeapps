import { NextRequest, NextResponse } from "next/server";

import { getGoalsPageData } from "@/lib/data";
import { apiErrorResponse } from "@/lib/api/route-errors";
import { requirePrisma } from "@/lib/prisma";
import { findCurrentUser } from "@/lib/auth/current-user";
import { savingGoalSchema } from "@/lib/validations";

export const dynamic = "force-static";

export async function GET() {
  return NextResponse.json(await getGoalsPageData());
}

// Top up a goal by moving money from an account into the goal — a transfer to
// savings, NOT a consumption expense (mirrors LocalApiClient). No transaction
// is recorded, so savings rate / budgets are not distorted; the account balance
// drops and the goal grows, leaving net worth (which counts goals) conserved.
async function depositToGoal(
  db: ReturnType<typeof requirePrisma>,
  userId: string,
  body: { goalId?: unknown; amount?: unknown; accountId?: unknown }
) {
  const goalId = String(body.goalId ?? "");
  const amount = Number(body.amount);
  const accountId = body.accountId ? String(body.accountId) : "";
  if (!goalId) return NextResponse.json({ error: "Goal id is required." }, { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0)
    return NextResponse.json({ error: "Введите сумму больше нуля." }, { status: 400 });
  if (!accountId)
    return NextResponse.json({ error: "Выберите счёт для пополнения." }, { status: 400 });

  const goal = await db.savingGoal.findFirst({ where: { id: goalId, userId } });
  if (!goal) return NextResponse.json({ error: "Цель не найдена." }, { status: 404 });

  const updated = await db.$transaction(async (tx) => {
    const account = await tx.account.findFirst({
      where: { id: accountId, userId, isArchived: false }
    });
    if (!account) throw new Error("Выберите существующий активный счёт.");
    if (amount > Number(account.balance)) throw new Error("Недостаточно средств на счёте.");
    await tx.account.update({
      where: { id: account.id },
      data: { balance: { decrement: amount } }
    });
    return tx.savingGoal.update({
      where: { id: goal.id },
      data: { currentAmount: { increment: amount } }
    });
  });

  return NextResponse.json(updated);
}

export async function POST(request: NextRequest) {
  try {
    const db = requirePrisma();
    const user = await findCurrentUser();
    if (!user)
      return NextResponse.json({ error: "Demo user not found. Run seed first." }, { status: 404 });

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
    const user = await findCurrentUser();
    if (!user)
      return NextResponse.json({ error: "Demo user not found. Run seed first." }, { status: 404 });
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
    const user = await findCurrentUser();
    if (!user)
      return NextResponse.json({ error: "Demo user not found. Run seed first." }, { status: 404 });
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
