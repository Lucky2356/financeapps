import { NextRequest, NextResponse } from "next/server";

import { getGoalsPageData } from "@/lib/data";
import { requirePrisma } from "@/lib/prisma";
import { savingGoalSchema } from "@/lib/validations";

export const dynamic = "force-static";

export async function GET() {
  return NextResponse.json(await getGoalsPageData());
}

export async function POST(request: NextRequest) {
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
}

export async function PUT(request: NextRequest) {
  const db = requirePrisma();
  const input = savingGoalSchema.parse(await request.json());

  if (!input.id) {
    return NextResponse.json({ error: "Goal id is required." }, { status: 400 });
  }

  const goal = await db.savingGoal.update({
    where: { id: input.id },
    data: {
      title: input.title,
      targetAmount: input.targetAmount,
      currentAmount: input.currentAmount,
      deadline: new Date(input.deadline)
    }
  });

  return NextResponse.json(goal);
}

export async function DELETE(request: NextRequest) {
  const db = requirePrisma();
  const id = request.nextUrl.searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Goal id is required." }, { status: 400 });
  }

  await db.savingGoal.delete({ where: { id } });

  return new NextResponse(null, { status: 204 });
}
