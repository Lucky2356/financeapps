import { startOfMonth } from "date-fns";
import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api/route-errors";
import { requirePrisma } from "@/lib/prisma";
import { findCurrentUser } from "@/lib/auth/current-user";
import {
  SAMPLE_ACCOUNTS,
  SAMPLE_BUDGETS,
  SAMPLE_CATEGORIES,
  SAMPLE_GOALS,
  SAMPLE_TRANSACTIONS,
  sampleDate,
  sampleDeadline
} from "@/lib/sample-data";

export const dynamic = "force-static";

// Seeds the example dataset for the current user (web/Prisma mirror of the
// desktop LocalApiClient loadSample). Replaces existing financial data so the
// example is reproducible; categories are upserted to respect the unique key.
export async function POST() {
  try {
    const db = requirePrisma();
    const user = await findCurrentUser();
    if (!user)
      return NextResponse.json({ error: "Demo user not found. Run seed first." }, { status: 404 });

    await db.$transaction(async (tx) => {
      await tx.transaction.deleteMany({ where: { userId: user.id } });
      await tx.budget.deleteMany({ where: { userId: user.id } });
      await tx.savingGoal.deleteMany({ where: { userId: user.id } });
      await tx.account.deleteMany({ where: { userId: user.id } });

      const categoryIdMap = new Map<string, string>();
      for (const category of SAMPLE_CATEGORIES) {
        const row = await tx.category.upsert({
          where: {
            userId_name_kind: { userId: user.id, name: category.label, kind: category.kind }
          },
          update: {
            color: category.color,
            isEssential: Boolean(category.isEssential),
            isSubscription: Boolean(category.isSubscription)
          },
          create: {
            userId: user.id,
            name: category.label,
            kind: category.kind,
            color: category.color,
            isEssential: Boolean(category.isEssential),
            isSubscription: Boolean(category.isSubscription)
          }
        });
        categoryIdMap.set(category.id, row.id);
      }

      for (const account of SAMPLE_ACCOUNTS) {
        await tx.account.create({
          data: {
            id: account.id,
            userId: user.id,
            name: account.name,
            type: account.type,
            balance: account.balance,
            currency: "RUB"
          }
        });
      }

      for (const transaction of SAMPLE_TRANSACTIONS) {
        await tx.transaction.create({
          data: {
            userId: user.id,
            accountId: transaction.accountId,
            categoryId: categoryIdMap.get(transaction.categoryId)!,
            amount: transaction.amount,
            type: transaction.type,
            date: sampleDate(transaction.monthOffset, transaction.day),
            description: transaction.description
          }
        });
      }

      const month = startOfMonth(new Date());
      for (const budget of SAMPLE_BUDGETS) {
        await tx.budget.create({
          data: {
            userId: user.id,
            categoryId: categoryIdMap.get(budget.categoryId)!,
            month,
            limitAmount: budget.limitAmount
          }
        });
      }

      for (const goal of SAMPLE_GOALS) {
        await tx.savingGoal.create({
          data: {
            userId: user.id,
            title: goal.title,
            targetAmount: goal.targetAmount,
            currentAmount: goal.currentAmount,
            deadline: sampleDeadline(goal.monthsToDeadline)
          }
        });
      }
    });

    return NextResponse.json({ loaded: true });
  } catch (error) {
    return apiErrorResponse(error, "Не удалось загрузить демо-данные.");
  }
}
