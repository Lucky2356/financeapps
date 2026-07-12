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
import type { AiLocale } from "@/lib/ai/lang";
import {
  buildCategorizePrompt,
  parseCategorizeReply,
  type BatchCategory,
  type BatchItem,
  type BatchSuggestion
} from "@/lib/ai/categorize-batch";
import { buildReviewPrompt } from "@/lib/ai/review-prompt";
import {
  buildBudgetPlanPrompt,
  parseBudgetPlan,
  type BudgetCategoryInput,
  type BudgetSuggestion
} from "@/lib/ai/budget-plan";
import { buildGoalPlanPrompt, type GoalPlanInput } from "@/lib/ai/goal-plan";

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
  const { system, user } = buildParsePrompt(text, context);
  const replyText = await complete({ apiKey, model, provider, effort, system, user });
  return parseTransactionDraft(replyText, context);
}

export type RequestFinancialAnswerArgs = {
  question: string;
  // Compact, pre-computed finance summary (no raw transactions) — see
  // lib/ai/finance-summary.ts. This is what leaves the device for the AI service.
  summary: string;
  apiKey: string;
  model?: string;
  provider?: AiProvider;
  effort?: string;
  locale?: AiLocale;
};

// Natural-language Q&A over the user's finances ("ask your finances"). Returns
// the model's free-text answer grounded in the provided summary.
export async function requestFinancialAnswer({
  question,
  summary,
  apiKey,
  model,
  provider,
  effort,
  locale = "ru"
}: RequestFinancialAnswerArgs): Promise<string> {
  if (!apiKey) throw new Error("Не задан API-ключ выбранного AI-провайдера.");
  if (!question.trim()) throw new Error("Введите вопрос.");

  const { buildInsightPrompt } = await import("@/lib/ai/insight-prompt");
  const { system, user } = buildInsightPrompt(question, summary, locale);
  const answer = await complete({ apiKey, model, provider, effort, system, user });
  if (!answer.trim()) throw new Error("Ассистент не дал ответа. Попробуйте переформулировать.");
  return answer.trim();
}

type BaseAiArgs = {
  apiKey: string;
  model?: string;
  provider?: AiProvider;
  effort?: string;
  locale: AiLocale;
};

// AI batch categorization (plan 1.3.0). Returns validated {id, categoryId} pairs
// — only known ids matching each transaction's income/expense kind.
export async function requestBatchCategorization(
  args: BaseAiArgs & { items: BatchItem[]; categories: BatchCategory[] }
): Promise<BatchSuggestion[]> {
  if (!args.apiKey) throw new Error("Не задан API-ключ выбранного AI-провайдера.");
  if (args.items.length === 0) return [];
  const { system, user } = buildCategorizePrompt(args.items, args.categories, args.locale);
  const reply = await complete({ ...args, system, user });
  return parseCategorizeReply(reply, args.items, args.categories);
}

// AI financial coach: a structured written review grounded in the summary.
export async function requestFinancialReview(
  args: BaseAiArgs & { summary: string }
): Promise<string> {
  if (!args.apiKey) throw new Error("Не задан API-ключ выбранного AI-провайдера.");
  if (!args.summary.trim()) throw new Error("Недостаточно данных для разбора.");
  const { system, user } = buildReviewPrompt(args.summary, args.locale);
  const answer = await complete({ ...args, system, user });
  if (!answer.trim()) throw new Error("Ассистент не дал ответа. Попробуйте ещё раз.");
  return answer.trim();
}

// AI budget planner: proposes monthly limits per expense category.
export async function requestBudgetPlan(
  args: BaseAiArgs & {
    categories: BudgetCategoryInput[];
    avgMonthlyIncome: number;
    currency: string;
  }
): Promise<BudgetSuggestion[]> {
  if (!args.apiKey) throw new Error("Не задан API-ключ выбранного AI-провайдера.");
  if (args.categories.length === 0) return [];
  const { system, user } = buildBudgetPlanPrompt(
    args.categories,
    args.avgMonthlyIncome,
    args.currency,
    args.locale
  );
  const reply = await complete({ ...args, system, user });
  return parseBudgetPlan(reply, args.categories);
}

// AI savings plan for a single goal (free-text advisory).
export async function requestGoalPlan(args: BaseAiArgs & { goal: GoalPlanInput }): Promise<string> {
  if (!args.apiKey) throw new Error("Не задан API-ключ выбранного AI-провайдера.");
  const { system, user } = buildGoalPlanPrompt(args.goal, args.locale);
  const answer = await complete({ ...args, system, user });
  if (!answer.trim()) throw new Error("Ассистент не дал ответа. Попробуйте ещё раз.");
  return answer.trim();
}

export type RequestReceiptDraftArgs = {
  // Base64-encoded image WITHOUT the "data:...;base64," prefix.
  imageBase64: string;
  mimeType: string;
  context: AiParseContext;
  apiKey: string;
  model?: string;
  provider?: AiProvider;
};

const VISION_MEDIA = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type VisionMedia = (typeof VISION_MEDIA)[number];

function normalizeMedia(mimeType: string): VisionMedia {
  return (VISION_MEDIA as readonly string[]).includes(mimeType)
    ? (mimeType as VisionMedia)
    : "image/jpeg";
}

// Reads a receipt photo and returns a draft transaction. Vision-capable
// providers only (Anthropic, OpenAI); DeepSeek V4 has no image input here.
export async function requestReceiptDraft({
  imageBase64,
  mimeType,
  context,
  apiKey,
  model,
  provider
}: RequestReceiptDraftArgs): Promise<AiTransactionDraft> {
  if (!apiKey) throw new Error("Не задан API-ключ выбранного AI-провайдера.");
  if (!imageBase64) throw new Error("Прикрепите фото чека.");

  const resolvedProvider = provider ?? providerForModel(model);
  if (resolvedProvider === "deepseek") {
    throw new Error("Выбранный провайдер не поддерживает фото. Выберите Claude или ChatGPT.");
  }
  const resolvedModel = model || providerInfo(resolvedProvider).defaultModel;
  const { system, user } = buildParsePrompt(
    "Извлеки данные операции из прикреплённого фото чека: сумму, дату и подходящую категорию.",
    context
  );

  const reply =
    resolvedProvider === "anthropic"
      ? await callAnthropicVision(apiKey, resolvedModel, system, user, imageBase64, mimeType)
      : await callOpenAiVision(apiKey, resolvedModel, system, user, imageBase64, mimeType);

  return parseTransactionDraft(reply, context);
}

async function callAnthropicVision(
  apiKey: string,
  model: string,
  system: string,
  user: string,
  imageBase64: string,
  mimeType: string
): Promise<string> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    system,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: normalizeMedia(mimeType), data: imageBase64 }
          },
          { type: "text", text: user }
        ]
      }
    ]
  });
  if (response.stop_reason === "refusal") {
    throw new Error("Запрос отклонён ассистентом. Попробуйте другое фото.");
  }
  return response.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("")
    .trim();
}

async function callOpenAiVision(
  apiKey: string,
  model: string,
  system: string,
  user: string,
  imageBase64: string,
  mimeType: string
): Promise<string> {
  const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
  const response = await client.chat.completions.create({
    model,
    max_completion_tokens: 4096,
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: [
          { type: "text", text: user },
          {
            type: "image_url",
            image_url: { url: `data:${normalizeMedia(mimeType)};base64,${imageBase64}` }
          }
        ]
      }
    ]
  });
  return response.choices[0]?.message?.content?.trim() ?? "";
}

// Shared provider dispatch: resolves provider/model/effort and routes to the
// right SDK, returning the raw text reply.
async function complete(args: {
  apiKey: string;
  model?: string;
  provider?: AiProvider;
  effort?: string;
  system: string;
  user: string;
}): Promise<string> {
  const resolvedProvider = args.provider ?? providerForModel(args.model);
  const resolvedModel = args.model || providerInfo(resolvedProvider).defaultModel;
  const resolvedEffort = normalizeEffort(args.effort);

  return resolvedProvider === "anthropic"
    ? callAnthropic(args.apiKey, resolvedModel, args.system, args.user, resolvedEffort)
    : callOpenAiCompatible(
        resolvedProvider,
        args.apiKey,
        resolvedModel,
        args.system,
        args.user,
        resolvedEffort
      );
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
