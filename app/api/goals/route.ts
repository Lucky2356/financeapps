import { NextRequest, NextResponse } from "next/server";

import { getGoalsPageData } from "@/lib/data";
import { apiErrorResponse } from "@/lib/api/route-errors";
import { requirePrisma } from "@/lib/prisma";
import { savingGoalSchema } from "@/lib/validations";

export const dynamic = "force-static";

export async function GET() {
  return NextResponse.json(await getGoalsPageData());
}

export async function POST(request: NextRequest) {
  try {
    const db = requirePrisma();
    const user = await db.user.findFirst({ orderBy: { createdAt: "asc" } });
    if (!user) return NextResponse.json({ error: "Demo user not found. Run seed first." }, { status: 404 });

    const input = savingGoalSchema.parse(await request.json());
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
