import { NextRequest, NextResponse } from "next/server";

import { getTransactionsPageData } from "@/lib/data";
import { apiErrorResponse } from "@/lib/api/route-errors";
import { requirePrisma } from "@/lib/prisma";
import { transactionSchema, transferSchema } from "@/lib/validations";

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

async function findOrCreateTransferCategory(
  tx: Parameters<Parameters<ReturnType<typeof requirePrisma>["$transaction"]>[0]>[0],
  userId: string,
  kind: "INCOME" | "EXPENSE"
) {
  const existing = await tx.category.findFirst({
    where: {
      userId,
      name: { equals: "Переводы", mode: "insensitive" },
      kind
    }
  });

  if (existing) return existing;

  return tx.category.create({
    data: {
      userId,
      name: "Переводы",
      kind,
      color: kind === "INCOME" ? "#0d9488" : "#64748b",
      icon: "ArrowRightLeft"
    }
  });
}

export async function GET(request: NextRequest) {
  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  return NextResponse.json(await getTransactionsPageData(params));
}

export async function POST(request: NextRequest) {
  try {
    const db = requirePrisma();
    const user = await defaultUser();
    const body = await request.json();
    if ((body as { action?: unknown }).action === "transfer") {
      const input = transferSchema.parse(body);
      const [fromAccount, toAccount] = await Promise.all([
        db.account.findFirst({ where: { id: input.fromAccountId, userId: user.id, isArchived: false } }),
        db.account.findFirst({ where: { id: input.toAccountId, userId: user.id, isArchived: false } })
      ]);

      if (!fromAccount || !toAccount) {
        return NextResponse.json({ error: "Выберите существующие активные счета для перевода." }, { status: 400 });
      }

      const transferId = crypto.randomUUID();
      const result = await db.$transaction(async (tx) => {
        const expenseCategory = await findOrCreateTransferCategory(tx, user.id, "EXPENSE");
        const incomeCategory = await findOrCreateTransferCategory(tx, user.id, "INCOME");
        const description = input.description || `Перевод ${fromAccount.name} -> ${toAccount.name}`;
        const expense = await tx.transaction.create({
          data: {
            userId: user.id,
            accountId: fromAccount.id,
            categoryId: expenseCategory.id,
            amount: input.amount,
            type: "EXPENSE",
            date: new Date(input.date),
            description: `${description} [transfer:${transferId}]`
          }
        });
        const income = await tx.transaction.create({
          data: {
            userId: user.id,
            accountId: toAccount.id,
            categoryId: incomeCategory.id,
            amount: input.amount,
            type: "INCOME",
            date: new Date(input.date),
            description: `${description} [transfer:${transferId}]`
          }
        });
        await tx.account.update({ where: { id: fromAccount.id }, data: { balance: { decrement: input.amount } } });
        await tx.account.update({ where: { id: toAccount.id }, data: { balance: { increment: input.amount } } });
        return { transferId, transactions: [expense, income] };
      });

      return NextResponse.json(result, { status: 201 });
    }

    const input = transactionSchema.parse(body);
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
  } catch (error) {
    return apiErrorResponse(error, "Не удалось создать операцию.");
  }
}

export async function PUT(request: NextRequest) {
  try {
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
  } catch (error) {
    return apiErrorResponse(error, "Не удалось обновить операцию.");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const db = requirePrisma();
    const user = await defaultUser();
    const id = request.nextUrl.searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Transaction id is required." }, { status: 400 });
    }

    const existing = await db.transaction.findFirstOrThrow({ where: { id, userId: user.id } });
    await db.$transaction([
      db.transaction.delete({ where: { id: existing.id } }),
      db.account.update({
        where: { id: existing.accountId },
        data: { balance: { decrement: balanceDelta(existing.type, Number(existing.amount)) } }
      })
    ]);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return apiErrorResponse(error, "Не удалось удалить операцию.");
  }
}
