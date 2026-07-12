import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse } from "@/lib/api/route-errors";
import { findCurrentUser } from "@/lib/auth/current-user";
import { rateLimit, tooManyRequests } from "@/lib/api/rate-limit";
import { resolveServerProvider } from "@/lib/ai/server-provider";
import { requestBudgetPlan } from "@/services/ai/AiAssistantService";

export const dynamic = "force-dynamic";

// Web proxy for the AI budget planner. Only category labels + average spend leave
// the browser; the key stays server-side.
const bodySchema = z.object({
  categories: z
    .array(
      z.object({
        categoryId: z.string().min(1),
        label: z.string().max(120),
        avgMonthly: z.coerce.number().finite().nonnegative()
      })
    )
    .min(1)
    .max(100),
  avgMonthlyIncome: z.coerce.number().finite().nonnegative(),
  currency: z.string().trim().max(8).default("RUB"),
  locale: z.enum(["ru", "en"]).default("ru")
});

export async function POST(request: NextRequest) {
  try {
    const user = await findCurrentUser();
    if (!user) return NextResponse.json({ error: "Требуется вход." }, { status: 401 });

    const limit = rateLimit(`ai-budgets:${user.id}`, 10, 60_000);
    if (!limit.ok) return tooManyRequests(limit.retryAfter);

    const { provider, apiKey, model, effort } = resolveServerProvider();
    if (!apiKey) {
      return NextResponse.json(
        { error: "AI-ассистент не настроен на сервере (нет API-ключа провайдера)." },
        { status: 503 }
      );
    }

    const { categories, avgMonthlyIncome, currency, locale } = bodySchema.parse(
      await request.json()
    );
    const suggestions = await requestBudgetPlan({
      categories,
      avgMonthlyIncome,
      currency,
      locale,
      apiKey,
      model,
      provider,
      effort
    });
    return NextResponse.json({ suggestions });
  } catch (error) {
    return apiErrorResponse(error, "Не удалось предложить лимиты.");
  }
}
