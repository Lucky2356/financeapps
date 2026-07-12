import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse } from "@/lib/api/route-errors";
import { findCurrentUser } from "@/lib/auth/current-user";
import { rateLimit, tooManyRequests } from "@/lib/api/rate-limit";
import { resolveServerProvider } from "@/lib/ai/server-provider";
import { requestFinancialReview } from "@/services/ai/AiAssistantService";

export const dynamic = "force-dynamic";

// Web proxy for the AI financial coach. The browser sends a compact summary (no
// raw transactions); the key stays server-side.
const bodySchema = z.object({
  summary: z.string().trim().min(1).max(4000),
  locale: z.enum(["ru", "en"]).default("ru")
});

export async function POST(request: NextRequest) {
  try {
    const user = await findCurrentUser();
    if (!user) return NextResponse.json({ error: "Требуется вход." }, { status: 401 });

    const limit = rateLimit(`ai-review:${user.id}`, 10, 60_000);
    if (!limit.ok) return tooManyRequests(limit.retryAfter);

    const { provider, apiKey, model, effort } = resolveServerProvider();
    if (!apiKey) {
      return NextResponse.json(
        { error: "AI-ассистент не настроен на сервере (нет API-ключа провайдера)." },
        { status: 503 }
      );
    }

    const { summary, locale } = bodySchema.parse(await request.json());
    const answer = await requestFinancialReview({
      summary,
      locale,
      apiKey,
      model,
      provider,
      effort
    });
    return NextResponse.json({ answer });
  } catch (error) {
    return apiErrorResponse(error, "Не удалось получить разбор.");
  }
}
