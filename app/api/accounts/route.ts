import { NextRequest, NextResponse } from "next/server";

import { getAccountsPageData } from "@/lib/data";
import { requirePrisma } from "@/lib/prisma";
import { accountSchema } from "@/lib/validations";

export const dynamic = "force-static";

async function defaultUser() {
  const user = await requirePrisma().user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) throw new Error("Demo user not found. Run seed first.");
  return user;
}

export async function GET() {
  return NextResponse.json(await getAccountsPageData());
}

export async function POST(request: NextRequest) {
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
}

export async function PUT(request: NextRequest) {
  const db = requirePrisma();
  const input = accountSchema.parse(await request.json());

  if (!input.id) {
    return NextResponse.json({ error: "Account id is required." }, { status: 400 });
  }

  const account = await db.account.update({
    where: { id: input.id },
    data: {
      name: input.name,
      type: input.type,
      balance: input.balance,
      currency: input.currency
    }
  });

  return NextResponse.json(account);
}

export async function DELETE(request: NextRequest) {
  const db = requirePrisma();
  const id = request.nextUrl.searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Account id is required." }, { status: 400 });
  }

  await db.account.update({ where: { id }, data: { isArchived: true } });

  return new NextResponse(null, { status: 204 });
}
