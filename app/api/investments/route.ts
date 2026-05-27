import { NextRequest, NextResponse } from "next/server";

import { getInvestmentData } from "@/lib/data";
import { requirePrisma } from "@/lib/prisma";
import { portfolioPositionSchema, watchlistItemSchema } from "@/lib/validations";

export const dynamic = "force-static";

export async function GET() {
  return NextResponse.json(await getInvestmentData());
}

async function defaultUser() {
  const db = requirePrisma();
  const user = await db.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) {
    throw new Error("Demo user not found. Run seed first.");
  }

  return user;
}

async function findOrCreatePortfolio(userId: string) {
  const db = requirePrisma();
  const existing = await db.portfolio.findFirst({ where: { userId }, orderBy: { createdAt: "asc" } });
  if (existing) return existing;

  const brokerageAccount = await db.account.findFirst({
    where: { userId, type: "BROKERAGE", isArchived: false },
    orderBy: { createdAt: "asc" }
  });

  return db.portfolio.create({
    data: {
      userId,
      accountId: brokerageAccount?.id,
      name: "Основной портфель"
    }
  });
}

async function deletePositionByTicker(userId: string, ticker: string) {
  const db = requirePrisma();
  const portfolio = await db.portfolio.findFirst({ where: { userId }, orderBy: { createdAt: "asc" } });
  const security = await db.security.findUnique({ where: { ticker } });

  if (!portfolio || !security) return;

  await db.portfolioPosition.deleteMany({
    where: {
      portfolioId: portfolio.id,
      securityId: security.id
    }
  });
}

export async function POST(request: NextRequest) {
  const db = requirePrisma();
  const user = await defaultUser();
  const payload = await request.json();
  const action = typeof payload.action === "string" ? payload.action : "";
  const actionTicker = typeof payload.ticker === "string" ? payload.ticker.toUpperCase() : "";

  if (action === "addWatchlist") {
    const input = watchlistItemSchema.parse(payload);
    const security = await db.security.findUnique({ where: { ticker: input.ticker } });
    if (!security) {
      return NextResponse.json({ error: "Security not found in the market directory." }, { status: 404 });
    }

    const item = await db.watchlistItem.upsert({
      where: {
        userId_securityId: {
          userId: user.id,
          securityId: security.id
        }
      },
      update: {},
      create: {
        userId: user.id,
        securityId: security.id
      }
    });

    return NextResponse.json(item, { status: 201 });
  }

  if (action === "removeWatchlist") {
    if (!actionTicker) {
      return NextResponse.json({ error: "Ticker is required." }, { status: 400 });
    }

    const security = await db.security.findUnique({ where: { ticker: actionTicker } });
    if (security) {
      await db.watchlistItem.deleteMany({
        where: {
          userId: user.id,
          securityId: security.id
        }
      });
    }

    return new NextResponse(null, { status: 204 });
  }

  if (action === "delete") {
    if (!actionTicker) {
      return NextResponse.json({ error: "Ticker is required." }, { status: 400 });
    }

    await deletePositionByTicker(user.id, actionTicker);
    return new NextResponse(null, { status: 204 });
  }

  const input = portfolioPositionSchema.parse(payload);
  const security = await db.security.findUnique({ where: { ticker: input.ticker } });

  if (!security) {
    return NextResponse.json({ error: "Security not found in the market directory." }, { status: 404 });
  }

  const portfolio = await findOrCreatePortfolio(user.id);
  const position = await db.portfolioPosition.upsert({
    where: {
      portfolioId_securityId: {
        portfolioId: portfolio.id,
        securityId: security.id
      }
    },
    update: {
      quantity: input.quantity,
      averageBuyPrice: input.averageBuyPrice
    },
    create: {
      portfolioId: portfolio.id,
      securityId: security.id,
      quantity: input.quantity,
      averageBuyPrice: input.averageBuyPrice
    }
  });

  return NextResponse.json(position, { status: 201 });
}

export async function PUT(request: NextRequest) {
  return POST(request);
}

export async function DELETE(request: NextRequest) {
  const user = await defaultUser();
  const ticker = new URL(request.url).searchParams.get("ticker")?.toUpperCase();

  if (!ticker) {
    return NextResponse.json({ error: "Ticker is required." }, { status: 400 });
  }

  await deletePositionByTicker(user.id, ticker);

  return new NextResponse(null, { status: 204 });
}
