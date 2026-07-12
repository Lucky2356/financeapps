import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse } from "@/lib/api/route-errors";
import { findCurrentUser } from "@/lib/auth/current-user";
import { rateLimit, tooManyRequests } from "@/lib/api/rate-limit";
import { resolveServerProvider } from "@/lib/ai/server-provider";
import { requestGoalPlan } from "@/services/ai/AiAssistantService";

export const dynamic = "force-dynamic";

// Web proxy for the AI goal savings planner. Only the goal figures + free
// cashflow leave the browser; the key stays server-side.
const bodySchema = z.object({
  goal: z.object({
    title: z.string().trim().max(120),
    targetAmount: z.coerce.number().finite().nonnegative(),
    currentAmount: z.coerce.number().finite().nonnegative(),
    deadline: z.string().max(40).default(""),
    monthlyFreeCashflow: z.coerce.number().finite(),
    currency: z.string().trim().max(8).default("RUB")
  }),
  locale: z.enum(["ru", "en"]).default("ru")
});

export async function POST(request: NextRequest) {
  try {
    const user = await findCurrentUser();
    if (!user) return NextResponse.json({ error: "Требуется вход." }, { status: 401 });

    const limit = rateLimit(`ai-goal-plan:${user.id}`, 10, 60_000);
    if (!limit.ok) return tooManyRequests(limit.retryAfter);

    const { provider, apiKey, model, effort } = resolveServerProvider();
    if (!apiKey) {
      return NextResponse.json(
        { error: "AI-ассистент не настроен на сервере (нет API-ключа провайдера)." },
        { status: 503 }
      );
    }

    const { goal, locale } = bodySchema.parse(await request.json());
    const answer = await requestGoalPlan({ goal, locale, apiKey, model, provider, effort });
    return NextResponse.json({ answer });
  } catch (error) {
    return apiErrorResponse(error, "Не удалось построить план.");
  }
}
