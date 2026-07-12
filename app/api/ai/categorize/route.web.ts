import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse } from "@/lib/api/route-errors";
import { findCurrentUser } from "@/lib/auth/current-user";
import { rateLimit, tooManyRequests } from "@/lib/api/rate-limit";
import { resolveServerProvider } from "@/lib/ai/server-provider";
import { requestBatchCategorization } from "@/services/ai/AiAssistantService";

export const dynamic = "force-dynamic";

// Web proxy for AI batch categorization. Only descriptions + category labels leave
// the browser; the provider key stays server-side. Desktop calls the service
// directly with the user's own key.
const kind = z.enum(["INCOME", "EXPENSE"]);
const bodySchema = z.object({
  items: z
    .array(z.object({ id: z.string().min(1), description: z.string().max(300), type: kind }))
    .min(1)
    .max(100),
  categories: z
    .array(z.object({ id: z.string().min(1), label: z.string().max(120), kind }))
    .max(200),
  locale: z.enum(["ru", "en"]).default("ru")
});

export async function POST(request: NextRequest) {
  try {
    const user = await findCurrentUser();
    if (!user) return NextResponse.json({ error: "Требуется вход." }, { status: 401 });

    const limit = rateLimit(`ai-categorize:${user.id}`, 10, 60_000);
    if (!limit.ok) return tooManyRequests(limit.retryAfter);

    const { provider, apiKey, model, effort } = resolveServerProvider();
    if (!apiKey) {
      return NextResponse.json(
        { error: "AI-ассистент не настроен на сервере (нет API-ключа провайдера)." },
        { status: 503 }
      );
    }

    const { items, categories, locale } = bodySchema.parse(await request.json());
    const suggestions = await requestBatchCategorization({
      items,
      categories,
      locale,
      apiKey,
      model,
      provider,
      effort
    });
    return NextResponse.json({ suggestions });
  } catch (error) {
    return apiErrorResponse(error, "Не удалось разобрать операции.");
  }
}
