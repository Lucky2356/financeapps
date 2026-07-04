import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

import {
  normalizeEffort,
  providerForModel,
  providerInfo,
  type AiEffort,
  type AiProvider
} from "@/lib/ai/models";
import {
  buildParsePrompt,
  parseTransactionDraft,
  type AiParseContext,
  type AiTransactionDraft
} from "@/lib/ai/parse-transaction";

// Thin wrapper over an LLM Messages/Chat API for AI-assisted transaction entry.
// Used in two places with the same signature:
//   - desktop: called client-side with the user's own API key (Tauri webview),
//   - web: called server-side from app/api/ai/parse/route.web.ts with a server key.
// The prompt building and reply parsing are the pure, provider-agnostic code in
// lib/ai/parse-transaction.ts — only the network call differs per provider.

export type RequestTransactionDraftArgs = {
  text: string;
  context: AiParseContext;
  apiKey: string;
  model?: string;
  provider?: AiProvider;
  // "Thinking depth" — mapped per provider (see AiEffort). Accepts a raw string
  // (stored setting / env) and is normalized to a valid effort here.
  effort?: string;
};

export async function requestTransactionDraft({
  text,
  context,
  apiKey,
  model,
  provider,
  effort
}: RequestTransactionDraftArgs): Promise<AiTransactionDraft> {
  if (!apiKey) {
    throw new Error("Не задан API-ключ выбранного AI-провайдера.");
  }
  if (!text.trim()) {
    throw new Error("Введите описание операции.");
  }

  // Resolve the provider explicitly, or infer it from the model id; then pick
  // that provider's default model when none was given.
  const resolvedProvider = provider ?? providerForModel(model);
  const resolvedModel = model || providerInfo(resolvedProvider).defaultModel;
  const resolvedEffort = normalizeEffort(effort);
  const { system, user } = buildParsePrompt(text, context);

  const replyText =
    resolvedProvider === "anthropic"
      ? await callAnthropic(apiKey, resolvedModel, system, user, resolvedEffort)
      : await callOpenAiCompatible(
          resolvedProvider,
          apiKey,
          resolvedModel,
          system,
          user,
          resolvedEffort
        );

  return parseTransactionDraft(replyText, context);
}

// dangerouslyAllowBrowser: the desktop app runs these in the Tauri webview with
// the user's own key (it never leaves their machine other than to the provider).
// On the server the flag is a no-op.

async function callAnthropic(
  apiKey: string,
  model: string,
  system: string,
  user: string,
  effort: AiEffort
): Promise<string> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  // Extended thinking only on the deepest level — the parse task is small, so
  // fast/balanced keep the previous single-shot behaviour and latency.
  const deep = effort === "high";
  const response = await client.messages.create({
    model,
    max_tokens: deep ? 8192 : 1024,
    ...(deep ? { thinking: { type: "enabled" as const, budget_tokens: 4096 } } : {}),
    system,
    messages: [{ role: "user", content: user }]
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Запрос отклонён ассистентом. Переформулируйте описание.");
  }

  // Thinking blocks (if any) are skipped — we only want the final text answer.
  return response.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("")
    .trim();
}

// OpenAI and DeepSeek share the OpenAI Chat Completions shape; DeepSeek only
// needs a different base URL. JSON is requested via the prompt and extracted by
// parseTransactionDraft, so no provider-specific response_format is required.
async function callOpenAiCompatible(
  provider: AiProvider,
  apiKey: string,
  model: string,
  system: string,
  user: string,
  effort: AiEffort
): Promise<string> {
  const baseURL = provider === "deepseek" ? "https://api.deepseek.com" : undefined;
  const client = new OpenAI({ apiKey, baseURL, dangerouslyAllowBrowser: true });
  const messages = [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user }
  ];

  // OpenAI's gpt-5.x are reasoning models: pass reasoning_effort and give the
  // reasoning + answer room via max_completion_tokens. DeepSeek V4 reasons by
  // default and uses the classic max_tokens field — keep it lean there.
  const response =
    provider === "openai"
      ? await client.chat.completions.create({
          model,
          max_completion_tokens: 4096,
          reasoning_effort: effort,
          messages
        })
      : await client.chat.completions.create({
          model,
          max_tokens: 1024,
          messages
        });

  return response.choices[0]?.message?.content?.trim() ?? "";
}
