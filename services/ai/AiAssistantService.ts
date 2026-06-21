import Anthropic from "@anthropic-ai/sdk";

import { AI_DEFAULT_MODEL } from "@/lib/ai/models";
import {
  buildParsePrompt,
  parseTransactionDraft,
  type AiParseContext,
  type AiTransactionDraft
} from "@/lib/ai/parse-transaction";

// Thin wrapper over the Anthropic Messages API for AI-assisted transaction
// entry (plan D3). Used in two places with the same signature:
//   - desktop: called client-side with the user's own API key (Tauri webview),
//   - web: called server-side from app/api/ai/parse/route.ts with a server key.
// Network call only — all prompt building and reply parsing is the pure code in
// lib/ai/parse-transaction.ts.

export type RequestTransactionDraftArgs = {
  text: string;
  context: AiParseContext;
  apiKey: string;
  model?: string;
};

export async function requestTransactionDraft({
  text,
  context,
  apiKey,
  model
}: RequestTransactionDraftArgs): Promise<AiTransactionDraft> {
  if (!apiKey) {
    throw new Error("Не задан API-ключ Anthropic.");
  }
  if (!text.trim()) {
    throw new Error("Введите описание операции.");
  }

  // dangerouslyAllowBrowser: the desktop app runs this in the Tauri webview
  // with the user's own key (it never leaves their machine other than to
  // Anthropic). On the server the flag is a no-op.
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const { system, user } = buildParsePrompt(text, context);

  // Scoped extraction of a single object — small, fast, deterministic. No
  // extended thinking (off by default on Opus 4.8); JSON-only via the prompt.
  const response = await client.messages.create({
    model: model || AI_DEFAULT_MODEL,
    max_tokens: 1024,
    system,
    messages: [{ role: "user", content: user }]
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Запрос отклонён ассистентом. Переформулируйте описание.");
  }

  const replyText = response.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("")
    .trim();

  return parseTransactionDraft(replyText, context);
}
