import { NextRequest, NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api/route-errors";
import { findCurrentUser } from "@/lib/auth/current-user";
import { createMarketDataProvider } from "@/services/market/createMarketDataProvider";

export const dynamic = "force-dynamic";

// Search the live exchange universe by ticker or name so the user can add any
// listed stock to their portfolio / watchlist.
export async function GET(request: NextRequest) {
  try {
    const user = await findCurrentUser();
    if (!user) return NextResponse.json({ error: "Не авторизован." }, { status: 401 });

    const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
    if (q.length < 1) return NextResponse.json({ results: [] });

    const results = await createMarketDataProvider().searchSecurities(q, 25);
    return NextResponse.json({ results });
  } catch (error) {
    return apiErrorResponse(error, "Не удалось выполнить поиск бумаг.");
  }
}
