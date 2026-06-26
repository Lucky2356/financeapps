import { NextRequest, NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api/route-errors";
import { findCurrentUser } from "@/lib/auth/current-user";
import { historyRangeStart } from "@/lib/market/history-range";
import { createMarketDataProvider } from "@/services/market/createMarketDataProvider";

export const dynamic = "force-dynamic";

// Live historical close prices for a ticker (MOEX), powering the per-stock chart.
export async function GET(request: NextRequest) {
  try {
    const user = await findCurrentUser();
    if (!user) return NextResponse.json({ error: "Не авторизован." }, { status: 401 });

    const ticker = request.nextUrl.searchParams.get("ticker")?.toUpperCase() ?? "";
    if (!ticker) return NextResponse.json({ error: "ticker is required" }, { status: 400 });
    const range = request.nextUrl.searchParams.get("range") ?? "6m";

    const prices = await createMarketDataProvider().getHistoricalPrices(
      ticker,
      historyRangeStart(range),
      new Date()
    );
    return NextResponse.json({
      ticker,
      range,
      points: prices.map((p) => ({ date: p.date.toISOString(), price: p.price }))
    });
  } catch (error) {
    return apiErrorResponse(error, "Не удалось загрузить историю котировок.");
  }
}
