import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse } from "@/lib/api/route-errors";
import { requestTransactionDraft } from "@/services/ai/AiAssistantService";

export const dynamic = "force-static";

// Web proxy for AI-assisted transaction entry (plan D3). The browser sends a
// short description plus a minimal context slice; the key stays server-side.
// Desktop does NOT use this route — it calls AiAssistantService directly with
// the user's own key.

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
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "AI-ассистент не настроен на сервере (нет ANTHROPIC_API_KEY)." },
        { status: 503 }
      );
    }

    const { text, context } = bodySchema.parse(await request.json());
    const draft = await requestTransactionDraft({
      text,
      context,
      apiKey,
      model: process.env.ANTHROPIC_MODEL
    });

    return NextResponse.json(draft);
  } catch (error) {
    return apiErrorResponse(error, "Не удалось распознать операцию.");
  }
}
