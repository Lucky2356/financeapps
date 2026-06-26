import { NextRequest, NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api/route-errors";
import { getRecurringTransactionsPageData } from "@/lib/data";
import { requirePrisma } from "@/lib/prisma";
import { findCurrentUser } from "@/lib/auth/current-user";
import { recurringTransactionSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";

async function defaultUser() {
  const user = await findCurrentUser();
  if (!user) throw new Error("Demo user not found. Run seed first.");
  return user;
}

async function validateRecurringRefs(
  userId: string,
  accountId: string,
  categoryId: string,
  type: "INCOME" | "EXPENSE"
) {
  const db = requirePrisma();
  const [account, category] = await Promise.all([
    db.account.findFirst({ where: { id: accountId, userId, isArchived: false } }),
    db.category.findFirst({ where: { id: categoryId, userId } })
  ]);

  if (!account) return "Выберите существующий активный счет.";
  if (!category) return "Выберите существующую категорию.";
  if (category.kind !== type) return "Тип шаблона должен совпадать с типом категории.";

  return null;
}

export async function GET() {
  return NextResponse.json(await getRecurringTransactionsPageData());
}

export async function POST(request: NextRequest) {
  try {
    const db = requirePrisma();
    const user = await defaultUser();
    const input = recurringTransactionSchema.parse(await request.json());
    const validationError = await validateRecurringRefs(
      user.id,
      input.accountId,
      input.categoryId,
      input.type
    );
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

    const created = await db.recurringTransaction.create({
      data: {
        userId: user.id,
        accountId: input.accountId,
        categoryId: input.categoryId,
        amount: input.amount,
        type: input.type,
        frequency: input.frequency,
        nextDate: new Date(input.nextDate),
        description: input.description || null,
        isActive: input.isActive
      }
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, "Не удалось создать плановый платеж.");
  }
}

export async function PUT(request: NextRequest) {
  try {
    const db = requirePrisma();
    const user = await defaultUser();
    const input = recurringTransactionSchema.parse(await request.json());

    if (!input.id)
      return NextResponse.json({ error: "Recurring transaction id is required." }, { status: 400 });

    const validationError = await validateRecurringRefs(
      user.id,
      input.accountId,
      input.categoryId,
      input.type
    );
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

    // updateMany with a userId-scoped where is the isolation boundary: a row owned
    // by another user matches zero records and is left untouched (count === 0).
    const result = await db.recurringTransaction.updateMany({
      where: { id: input.id, userId: user.id },
      data: {
        accountId: input.accountId,
        categoryId: input.categoryId,
        amount: input.amount,
        type: input.type,
        frequency: input.frequency,
        nextDate: new Date(input.nextDate),
        description: input.description || null,
        isActive: input.isActive
      }
    });
    if (result.count === 0)
      return NextResponse.json({ error: "Запись не найдена." }, { status: 404 });

    const updated = await db.recurringTransaction.findUnique({ where: { id: input.id } });
    return NextResponse.json(updated);
  } catch (error) {
    return apiErrorResponse(error, "Не удалось обновить плановый платеж.");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const db = requirePrisma();
    const user = await defaultUser();
    const id = request.nextUrl.searchParams.get("id");

    if (!id)
      return NextResponse.json({ error: "Recurring transaction id is required." }, { status: 400 });

    await db.recurringTransaction.findFirstOrThrow({ where: { id, userId: user.id } });
    await db.recurringTransaction.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return apiErrorResponse(error, "Не удалось удалить плановый платеж.");
  }
}
