import { NextRequest, NextResponse } from "next/server";
import { startOfMonth } from "date-fns";

import { getBudgetsPageData } from "@/lib/data";
import { requirePrisma } from "@/lib/prisma";
import { budgetSchema } from "@/lib/validations";

export const dynamic = "force-static";

export async function GET() {
  return NextResponse.json(await getBudgetsPageData());
}

export async function POST(request: NextRequest) {
  const db = requirePrisma();
  const user = await db.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) return NextResponse.json({ error: "Demo user not found. Run seed first." }, { status: 404 });

  const input = budgetSchema.parse(await request.json());
  const month = startOfMonth(new Date());
  const budget = await db.budget.upsert({
    where: {
      userId_categoryId_month: {
        userId: user.id,
        categoryId: input.categoryId,
        month
      }
    },
    update: { limitAmount: input.limitAmount },
    create: {
      userId: user.id,
      categoryId: input.categoryId,
      month,
      limitAmount: input.limitAmount
    }
  });

  return NextResponse.json(budget);
}
