import { NextRequest, NextResponse } from "next/server";

import { getTransactionsPageData } from "@/lib/data";
import { requirePrisma } from "@/lib/prisma";
import { transactionSchema } from "@/lib/validations";

export const dynamic = "force-static";

async function defaultUser() {
  const user = await requirePrisma().user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) throw new Error("Demo user not found. Run seed first.");
  return user;
}

function balanceDelta(type: "INCOME" | "EXPENSE", amount: number) {
  return type === "INCOME" ? amount : -amount;
}

async function validateTransactionRefs(userId: string, accountId: string, categoryId: string, type: "INCOME" | "EXPENSE") {
  const db = requirePrisma();
  const [account, category] = await Promise.all([
    db.account.findFirst({ where: { id: accountId, userId, isArchived: false } }),
    db.category.findFirst({ where: { id: categoryId, userId } })
  ]);

  if (!account) {
    return "Выберите существующий активный счет.";
  }

  if (!category) {
    return "Выберите существующую категорию.";
  }

  if (category.kind !== type) {
    return "Тип операции должен совпадать с типом категории.";
  }

  return null;
}

export async function GET(request: NextRequest) {
  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  return NextResponse.json(await getTransactionsPageData(params));
}

export async function POST(request: NextRequest) {
  const db = requirePrisma();
  const user = await defaultUser();
  const input = transactionSchema.parse(await request.json());
  const validationError = await validateTransactionRefs(user.id, input.accountId, input.categoryId, input.type);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  const [transaction] = await db.$transaction([
    db.transaction.create({
      data: {
        userId: user.id,
        accountId: input.accountId,
        categoryId: input.categoryId,
        amount: input.amount,
        type: input.type,
        date: new Date(input.date),
        description: input.description || null
      }
    }),
    db.account.update({
      where: { id: input.accountId },
      data: { balance: { increment: balanceDelta(input.type, input.amount) } }
    })
  ]);

  return NextResponse.json(transaction, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const db = requirePrisma();
  const body = await request.json();
  const input = transactionSchema.parse(body);
  const user = await defaultUser();

  if (!input.id) {
    return NextResponse.json({ error: "Transaction id is required." }, { status: 400 });
  }

  const validationError = await validateTransactionRefs(user.id, input.accountId, input.categoryId, input.type);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  const existing = await db.transaction.findFirstOrThrow({ where: { id: input.id, userId: user.id } });
  const transaction = await db.$transaction(async (tx) => {
    await tx.account.update({
      where: { id: existing.accountId },
      data: { balance: { decrement: balanceDelta(existing.type, Number(existing.amount)) } }
    });
    const updated = await tx.transaction.update({
      where: { id: input.id },
      data: {
        accountId: input.accountId,
        categoryId: input.categoryId,
        amount: input.amount,
        type: input.type,
        date: new Date(input.date),
        description: input.description || null
      }
    });
    await tx.account.update({
      where: { id: input.accountId },
      data: { balance: { increment: balanceDelta(input.type, input.amount) } }
    });
    return updated;
  });

  return NextResponse.json(transaction);
}

export async function DELETE(request: NextRequest) {
  const db = requirePrisma();
  const id = request.nextUrl.searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Transaction id is required." }, { status: 400 });
  }

  const existing = await db.transaction.findUniqueOrThrow({ where: { id } });
  await db.$transaction([
    db.transaction.delete({ where: { id } }),
    db.account.update({
      where: { id: existing.accountId },
      data: { balance: { decrement: balanceDelta(existing.type, Number(existing.amount)) } }
    })
  ]);

  return new NextResponse(null, { status: 204 });
}
