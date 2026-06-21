import { NextRequest, NextResponse } from "next/server";

import { getLiabilitiesPageData } from "@/lib/data";
import { apiErrorResponse } from "@/lib/api/route-errors";
import { requirePrisma } from "@/lib/prisma";
import { liabilitySchema } from "@/lib/validations";

export const dynamic = "force-static";

export async function GET() {
  return NextResponse.json(await getLiabilitiesPageData());
}

function toData(input: ReturnType<typeof liabilitySchema.parse>) {
  return {
    name: input.name,
    kind: input.kind,
    balance: input.balance,
    originalAmount: input.originalAmount,
    interestRate: input.interestRate,
    minPayment: input.minPayment,
    dueDay: input.dueDay ?? null,
    currency: input.currency
  };
}

export async function POST(request: NextRequest) {
  try {
    const db = requirePrisma();
    const user = await db.user.findFirst({ orderBy: { createdAt: "asc" } });
    if (!user)
      return NextResponse.json({ error: "Demo user not found. Run seed first." }, { status: 404 });

    const input = liabilitySchema.parse(await request.json());
    const liability = await db.liability.create({
      data: { userId: user.id, ...toData(input) }
    });

    return NextResponse.json(liability, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, "Не удалось создать обязательство.");
  }
}

export async function PUT(request: NextRequest) {
  try {
    const db = requirePrisma();
    const user = await db.user.findFirst({ orderBy: { createdAt: "asc" } });
    if (!user)
      return NextResponse.json({ error: "Demo user not found. Run seed first." }, { status: 404 });

    const input = liabilitySchema.parse(await request.json());
    if (!input.id) {
      return NextResponse.json({ error: "Liability id is required." }, { status: 400 });
    }

    const liability = await db.liability.update({
      where: { id: input.id, userId: user.id },
      data: toData(input)
    });

    return NextResponse.json(liability);
  } catch (error) {
    return apiErrorResponse(error, "Не удалось обновить обязательство.");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const db = requirePrisma();
    const user = await db.user.findFirst({ orderBy: { createdAt: "asc" } });
    if (!user)
      return NextResponse.json({ error: "Demo user not found. Run seed first." }, { status: 404 });
    const id = request.nextUrl.searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Liability id is required." }, { status: 400 });
    }

    await db.liability.delete({ where: { id, userId: user.id } });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return apiErrorResponse(error, "Не удалось удалить обязательство.");
  }
}
