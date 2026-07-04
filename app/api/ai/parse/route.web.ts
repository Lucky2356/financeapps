import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse } from "@/lib/api/route-errors";
import { findCurrentUser } from "@/lib/auth/current-user";
import { rateLimit, tooManyRequests } from "@/lib/api/rate-limit";
import { providerInfo, type AiProvider } from "@/lib/ai/models";
import { requestTransactionDraft } from "@/services/ai/AiAssistantService";

export const dynamic = "force-dynamic";

// Web proxy for AI-assisted transaction entry (plan D3). The browser sends a
// short description plus a minimal context slice; the key stays server-side.
// Desktop does NOT use this route — it calls AiAssistantService directly with
// the user's own key.
//
// The owner picks the provider server-side via env (AI_PROVIDER = anthropic |
// openai | deepseek). The key/model are read from that provider's env vars, so
// the browser never sees or chooses them.
function resolveServerProvider(): {
  provider: AiProvider;
  apiKey: string | undefined;
  model: string | undefined;
} {
  const provider = providerInfo(process.env.AI_PROVIDER).id;
  switch (provider) {
    case "openai":
      return {
        provider,
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL
      };
    case "deepseek":
      return {
        provider,
        apiKey: process.env.DEEPSEEK_API_KEY,
        model: process.env.DEEPSEEK_MODEL
      };
    default:
      return {
        provider,
        apiKey: process.env.ANTHROPIC_API_KEY,
        model: process.env.ANTHROPIC_MODEL
      };
  }
}

const bodySchema = z.object({
  text: z.string().trim().min(1).max(500),
  context: z.object({
    today: z.string().min(1),
    currency: z.string().min(1).max(8),
    categories: z
      .array(
        z.object({
          id: z.string().min(1),
          label: z.string().min(1).max(120),
          kind: z.enum(["INCOME", "EXPENSE"])
        })
      )
      .max(200),
    accounts: z
      .array(z.object({ id: z.string().min(1), name: z.string().min(1).max(120) }))
      .max(100)
  })
});

export async function POST(request: NextRequest) {
  try {
    // Auth required: this route uses the server's Anthropic key, so it must not
    // be callable anonymously (otherwise anyone could drain the key/budget).
    const user = await findCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Требуется вход." }, { status: 401 });
    }

    // Per-user limit to cap AI spend.
    const limit = rateLimit(`ai:${user.id}`, 20, 60_000);
    if (!limit.ok) return tooManyRequests(limit.retryAfter);

    const { provider, apiKey, model } = resolveServerProvider();
    if (!apiKey) {
      return NextResponse.json(
        { error: "AI-ассистент не настроен на сервере (нет API-ключа провайдера)." },
        { status: 503 }
      );
    }

    const { text, context } = bodySchema.parse(await request.json());
    const draft = await requestTransactionDraft({
      text,
      context,
      apiKey,
      model,
      provider,
      effort: process.env.AI_EFFORT
    });

    return NextResponse.json(draft);
  } catch (error) {
    return apiErrorResponse(error, "Не удалось распознать операцию.");
  }
}
