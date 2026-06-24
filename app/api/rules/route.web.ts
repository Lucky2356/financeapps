import { NextRequest, NextResponse } from "next/server";

import { getRulesPageData } from "@/lib/data";
import { apiErrorResponse } from "@/lib/api/route-errors";
import { requirePrisma } from "@/lib/prisma";
import { findCurrentUser } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getRulesPageData());
}

export async function POST(request: NextRequest) {
  try {
    const db = requirePrisma();
    const user = await findCurrentUser();
    if (!user)
      return NextResponse.json({ error: "Demo user not found. Run seed first." }, { status: 404 });

    const body = (await request.json()) as { match?: unknown; categoryId?: unknown };
    const match = typeof body.match === "string" ? body.match.trim() : "";
    const categoryId = typeof body.categoryId === "string" ? body.categoryId : "";
    if (!match || !categoryId) {
      return NextResponse.json({ error: "Укажите текст и категорию." }, { status: 400 });
    }

    // The rule's category must belong to the current user (isolation).
    const category = await db.category.findFirst({ where: { id: categoryId, userId: user.id } });
    if (!category) {
      return NextResponse.json({ error: "Выберите существующую категорию." }, { status: 400 });
    }

    const rule = await db.rule.create({ data: { userId: user.id, match, categoryId } });
    return NextResponse.json(
      { id: rule.id, match: rule.match, categoryId: rule.categoryId },
      { status: 201 }
    );
  } catch (error) {
    return apiErrorResponse(error, "Не удалось добавить правило.");
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
      return NextResponse.json({ error: "Rule id is required." }, { status: 400 });
    }

    await db.rule.deleteMany({ where: { id, userId: user.id } });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return apiErrorResponse(error, "Не удалось удалить правило.");
  }
}
