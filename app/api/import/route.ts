import type { CategoryKind, TransactionType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { getImportPageData } from "@/lib/data";
import { apiErrorResponse } from "@/lib/api/route-errors";
import { requirePrisma } from "@/lib/prisma";
import { csvImportSchema } from "@/lib/validations";
import { parseImportedAmount, parseImportedDate } from "@/services/import/CsvParsing";

export const dynamic = "force-static";

export async function GET() {
  return NextResponse.json(await getImportPageData());
}

function balanceDelta(type: TransactionType, amount: number) {
  return type === "INCOME" ? amount : -amount;
}

async function findOrCreateImportCategory(
  tx: Parameters<Parameters<ReturnType<typeof requirePrisma>["$transaction"]>[0]>[0],
  userId: string,
  name: string,
  kind: CategoryKind
) {
  const normalizedName = name.trim() || (kind === "INCOME" ? "Импорт доходов" : "Импорт расходов");
  const existing = await tx.category.findFirst({
    where: {
      userId,
      name: { equals: normalizedName, mode: "insensitive" },
      kind
    }
  });

  if (existing) return existing;

  return tx.category.create({
    data: {
      userId,
      name: normalizedName,
      kind,
      color: kind === "INCOME" ? "#16a34a" : "#64748b",
      icon: "Upload"
    }
  });
}

export async function POST(request: NextRequest) {
  try {
    const db = requirePrisma();
    const user = await db.user.findFirst({ orderBy: { createdAt: "asc" } });
    if (!user) return NextResponse.json({ error: "Demo user not found. Run seed first." }, { status: 404 });

    const input = csvImportSchema.parse(await request.json());
    const parsedRows = JSON.parse(input.rows) as unknown;
    const rows = Array.isArray(parsedRows) ? (parsedRows as Array<Record<string, unknown>>) : [];
    const accounts = await db.account.findMany({ where: { userId: user.id, isArchived: false } });
    const fallbackAccount = accounts[0];
    if (!fallbackAccount) return NextResponse.json({ error: "Create an account before importing CSV." }, { status: 400 });

    let imported = 0;
    let skipped = 0;
    await db.$transaction(async (tx) => {
      for (const row of rows) {
        const rawAmount = parseImportedAmount(row[input.amountColumn]);
        const date = parseImportedDate(row[input.dateColumn]);
        if (rawAmount === null || rawAmount === 0 || !date) {
          skipped += 1;
          continue;
        }

        const type: TransactionType = rawAmount >= 0 ? "INCOME" : "EXPENSE";
        const amount = Math.abs(rawAmount);
        const accountName = String(row[input.accountColumn ?? ""] ?? "").trim().toLowerCase();
        const account = accounts.find((item) => item.name.toLowerCase() === accountName) ?? fallbackAccount;
        const categoryName = String(row[input.categoryColumn ?? ""] ?? "").trim();
        const category = await findOrCreateImportCategory(tx, user.id, categoryName, type);

        await tx.transaction.create({
          data: {
            userId: user.id,
            accountId: account.id,
            categoryId: category.id,
            amount,
            type,
            date,
            description: String(row[input.descriptionColumn ?? ""] ?? "").trim() || null
          }
        });
        await tx.account.update({
          where: { id: account.id },
          data: { balance: { increment: balanceDelta(type, amount) } }
        });
        imported += 1;
      }
    });

    return NextResponse.json({ imported, skipped });
  } catch (error) {
    return apiErrorResponse(error, "Не удалось импортировать CSV.");
  }
}
