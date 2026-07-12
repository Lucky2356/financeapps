import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse } from "@/lib/api/route-errors";
import { findCurrentUser } from "@/lib/auth/current-user";
import { rateLimit, tooManyRequests } from "@/lib/api/rate-limit";
import { resolveServerProvider } from "@/lib/ai/server-provider";
import { requestFinancialAnswer } from "@/services/ai/AiAssistantService";

export const dynamic = "force-dynamic";

// Web proxy for the "ask your finances" AI feature. The browser sends a question
// plus a compact, pre-computed finance summary (no raw transactions); the key
// stays server-side. Desktop calls AiAssistantService directly with its own key.

const bodySchema = z.object({
  question: z.string().trim().min(1).max(500),
  summary: z.string().trim().min(1).max(4000),
  locale: z.enum(["ru", "en"]).default("ru")
});

export async function POST(request: NextRequest) {
  try {
    const user = await findCurrentUser();
    if (!user) return NextResponse.json({ error: "Требуется вход." }, { status: 401 });

    // Per-user limit to cap AI spend (insights can be pricier than parsing).
    const limit = rateLimit(`ai-insight:${user.id}`, 15, 60_000);
    if (!limit.ok) return tooManyRequests(limit.retryAfter);

    const { provider, apiKey, model, effort } = resolveServerProvider();
    if (!apiKey) {
      return NextResponse.json(
        { error: "AI-ассистент не настроен на сервере (нет API-ключа провайдера)." },
        { status: 503 }
      );
    }

    const { question, summary, locale } = bodySchema.parse(await request.json());
    const answer = await requestFinancialAnswer({
      question,
      summary,
      locale,
      apiKey,
      model,
      provider,
      effort
    });

    return NextResponse.json({ answer });
  } catch (error) {
    return apiErrorResponse(error, "Не удалось получить ответ ассистента.");
  }
}
