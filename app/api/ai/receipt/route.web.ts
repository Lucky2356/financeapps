import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse } from "@/lib/api/route-errors";
import { findCurrentUser } from "@/lib/auth/current-user";
import { rateLimit, tooManyRequests } from "@/lib/api/rate-limit";
import { resolveServerProvider } from "@/lib/ai/server-provider";
import { requestReceiptDraft } from "@/services/ai/AiAssistantService";

export const dynamic = "force-dynamic";

// Web proxy for receipt-photo OCR. The browser sends a base64 image plus the
// minimal category/account context; the key stays server-side. Desktop calls
// AiAssistantService directly with its own key.

const bodySchema = z.object({
  // Base64 without the data URL prefix; ~5 MB image ≈ 6.7M chars.
  imageBase64: z.string().min(1).max(7_000_000),
  mimeType: z.string().regex(/^image\/(jpeg|png|gif|webp)$/),
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
    const user = await findCurrentUser();
    if (!user) return NextResponse.json({ error: "Требуется вход." }, { status: 401 });

    const limit = rateLimit(`ai-receipt:${user.id}`, 10, 60_000);
    if (!limit.ok) return tooManyRequests(limit.retryAfter);

    const { provider, apiKey, model } = resolveServerProvider();
    if (!apiKey) {
      return NextResponse.json(
        { error: "AI-ассистент не настроен на сервере (нет API-ключа провайдера)." },
        { status: 503 }
      );
    }
    if (provider === "deepseek") {
      return NextResponse.json(
        { error: "Провайдер сервера не поддерживает фото. Настройте Claude или OpenAI." },
        { status: 400 }
      );
    }

    const { imageBase64, mimeType, context } = bodySchema.parse(await request.json());
    const draft = await requestReceiptDraft({
      imageBase64,
      mimeType,
      context,
      apiKey,
      model,
      provider
    });

    return NextResponse.json(draft);
  } catch (error) {
    return apiErrorResponse(error, "Не удалось распознать чек.");
  }
}
