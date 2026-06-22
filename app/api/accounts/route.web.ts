import { NextRequest, NextResponse } from "next/server";

import { getAccountsPageData } from "@/lib/data";
import { apiErrorResponse } from "@/lib/api/route-errors";
import { requirePrisma } from "@/lib/prisma";
import { findCurrentUser } from "@/lib/auth/current-user";
import { accountSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";

async function defaultUser() {
  const user = await findCurrentUser();
  if (!user) throw new Error("Demo user not found. Run seed first.");
  return user;
}

export async function GET() {
  return NextResponse.json(await getAccountsPageData());
}

export async function POST(request: NextRequest) {
  try {
    const db = requirePrisma();
    const user = await defaultUser();
    const input = accountSchema.parse(await request.json());
    const account = await db.account.create({
      data: {
        userId: user.id,
        name: input.name,
        type: input.type,
        balance: input.balance,
        currency: input.currency
      }
    });

    return NextResponse.json(account, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, "Не удалось создать счет.");
  }
}

export async function PUT(request: NextRequest) {
  try {
    const db = requirePrisma();
    const user = await defaultUser();
    const input = accountSchema.parse(await request.json());

    if (!input.id) {
      return NextResponse.json({ error: "Account id is required." }, { status: 400 });
    }

    const account = await db.account.update({
      where: { id: input.id, userId: user.id },
      data: {
        name: input.name,
        type: input.type,
        balance: input.balance,
        currency: input.currency
      }
    });

    return NextResponse.json(account);
  } catch (error) {
    return apiErrorResponse(error, "Не удалось обновить счет.");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const db = requirePrisma();
    const user = await defaultUser();
    const id = request.nextUrl.searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Account id is required." }, { status: 400 });
    }

    await db.account.update({ where: { id, userId: user.id }, data: { isArchived: true } });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return apiErrorResponse(error, "Не удалось удалить счет.");
  }
}
