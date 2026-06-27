import type { CategoryKind, TransactionType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { getImportPageData } from "@/lib/data";
import { apiErrorResponse } from "@/lib/api/route-errors";
import { assertSameOrigin } from "@/lib/api/csrf";
import { suggestCategoryId } from "@/lib/category-suggest";
import { requirePrisma } from "@/lib/prisma";
import { findCurrentUser } from "@/lib/auth/current-user";
import { MAX_IMPORT_ROWS, csvImportSchema } from "@/lib/validations";
import { parseImportedAmount, parseImportedDate } from "@/services/import/CsvParsing";

export const dynamic = "force-dynamic";

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
    const crossOrigin = assertSameOrigin(request);
    if (crossOrigin) return crossOrigin;

    const db = requirePrisma();
    const user = await findCurrentUser();
    if (!user) return NextResponse.json({ error: "Требуется вход." }, { status: 401 });

    if (!(request.headers.get("content-type") ?? "").includes("application/json"))
      return NextResponse.json({ error: "Ожидается application/json." }, { status: 415 });

    const input = csvImportSchema.parse(await request.json());
    const parsedRows = JSON.parse(input.rows) as unknown;
    const rows = Array.isArray(parsedRows) ? (parsedRows as Array<Record<string, unknown>>) : [];
    if (rows.length > MAX_IMPORT_ROWS)
      return NextResponse.json(
        { error: `Слишком много строк (макс. ${MAX_IMPORT_ROWS}).` },
        { status: 400 }
      );
    const accounts = await db.account.findMany({ where: { userId: user.id, isArchived: false } });
    const fallbackAccount = accounts[0];
    if (!fallbackAccount)
      return NextResponse.json(
        { error: "Create an account before importing CSV." },
        { status: 400 }
      );

    // History + user rules for auto-categorizing rows that arrive without a
    // category column. Rules take priority over the history heuristic (handled
    // inside suggestCategoryId).
    const [categories, historyRows, rules] = await Promise.all([
      db.category.findMany({ where: { userId: user.id } }),
      db.transaction.findMany({
        where: { userId: user.id },
        select: { description: true, type: true, categoryId: true }
      }),
      db.rule.findMany({ where: { userId: user.id } })
    ]);
    const history = historyRows.map((row) => ({
      description: row.description,
      type: row.type,
      category: { id: row.categoryId }
    }));
    const categorizationRules = rules.map((rule) => ({
      id: rule.id,
      match: rule.match,
      categoryId: rule.categoryId
    }));

    // One batch id per import call, stamped on every created row so the whole
    // import can be undone as a unit (see /api/import/undo).
    const batchId = crypto.randomUUID();
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
        const accountName = String(row[input.accountColumn ?? ""] ?? "")
          .trim()
          .toLowerCase();
        const account =
          accounts.find((item) => item.name.toLowerCase() === accountName) ?? fallbackAccount;
        const categoryName = String(row[input.categoryColumn ?? ""] ?? "").trim();
        const description = String(row[input.descriptionColumn ?? ""] ?? "").trim() || null;
        // Use the explicit category if present; otherwise try to auto-categorize
        // from the description before falling back to a generic import bucket.
        let category;
        if (categoryName) {
          category = await findOrCreateImportCategory(tx, user.id, categoryName, type);
        } else {
          const suggestedId = suggestCategoryId(description ?? "", history, {
            type,
            rules: categorizationRules
          });
          category =
            (suggestedId
              ? categories.find((item) => item.id === suggestedId && item.kind === type)
              : undefined) ?? (await findOrCreateImportCategory(tx, user.id, "", type));
        }
        const duplicate = await tx.transaction.findFirst({
          where: {
            userId: user.id,
            accountId: account.id,
            categoryId: category.id,
            amount,
            type,
            date,
            description
          }
        });

        if (duplicate) {
          skipped += 1;
          continue;
        }

        await tx.transaction.create({
          data: {
            userId: user.id,
            accountId: account.id,
            categoryId: category.id,
            amount,
            type,
            date,
            description,
            importBatchId: batchId
          }
        });
        await tx.account.update({
          where: { id: account.id },
          data: { balance: { increment: balanceDelta(type, amount) } }
        });
        imported += 1;
      }
    });

    return NextResponse.json({ imported, skipped, batchId: imported > 0 ? batchId : null });
  } catch (error) {
    return apiErrorResponse(error, "Не удалось импортировать CSV.");
  }
}
