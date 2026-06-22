import { NextRequest, NextResponse } from "next/server";

import { getCategoriesPageData } from "@/lib/data";
import { apiErrorResponse } from "@/lib/api/route-errors";
import { requirePrisma } from "@/lib/prisma";
import { findCurrentUser } from "@/lib/auth/current-user";
import { categoryInputSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";

async function defaultUser() {
  const user = await findCurrentUser();
  if (!user) throw new Error("Demo user not found. Run seed first.");
  return user;
}

export async function GET() {
  return NextResponse.json(await getCategoriesPageData());
}

export async function POST(request: NextRequest) {
  try {
    const db = requirePrisma();
    const user = await defaultUser();
    const input = categoryInputSchema.parse(await request.json());

    // Check uniqueness: @@unique([userId, name, kind])
    const existing = await db.category.findFirst({
      where: {
        userId: user.id,
        name: { equals: input.name, mode: "insensitive" },
        kind: input.kind
      }
    });
    if (existing) {
      return NextResponse.json(
        { error: "Категория с таким именем уже существует." },
        { status: 409 }
      );
    }

    const category = await db.category.create({
      data: {
        userId: user.id,
        name: input.name,
        kind: input.kind,
        color: input.color,
        isEssential: input.isEssential,
        isSubscription: input.isSubscription
      }
    });

    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, "Не удалось создать категорию.");
  }
}

export async function PUT(request: NextRequest) {
  try {
    const db = requirePrisma();
    const user = await defaultUser();
    const input = categoryInputSchema.parse(await request.json());

    if (!input.id) {
      return NextResponse.json({ error: "Category id is required." }, { status: 400 });
    }

    // Check uniqueness for other categories with the same name/kind
    const duplicate = await db.category.findFirst({
      where: {
        userId: user.id,
        name: { equals: input.name, mode: "insensitive" },
        kind: input.kind,
        id: { not: input.id }
      }
    });
    if (duplicate) {
      return NextResponse.json(
        { error: "Категория с таким именем уже существует." },
        { status: 409 }
      );
    }

    const category = await db.category.update({
      where: { id: input.id, userId: user.id },
      data: {
        name: input.name,
        kind: input.kind,
        color: input.color,
        isEssential: input.isEssential,
        isSubscription: input.isSubscription
      }
    });

    return NextResponse.json(category);
  } catch (error) {
    return apiErrorResponse(error, "Не удалось обновить категорию.");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const db = requirePrisma();
    const user = await defaultUser();
    const categoryId = request.nextUrl.searchParams.get("id");

    if (!categoryId) {
      return NextResponse.json({ error: "Category id is required." }, { status: 400 });
    }

    // Check if category has transactions
    const txCount = await db.transaction.count({
      where: { categoryId, userId: user.id }
    });
    if (txCount > 0) {
      return NextResponse.json(
        { error: `Нельзя удалить категорию: к ней привязано ${txCount} операций.` },
        { status: 409 }
      );
    }

    await db.category.delete({ where: { id: categoryId, userId: user.id } });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return apiErrorResponse(error, "Не удалось удалить категорию.");
  }
}
