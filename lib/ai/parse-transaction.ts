import { z } from "zod";

// Pure helpers for the AI-assisted transaction entry (plan D3). Everything in
// this file is network-free and fully unit-testable: prompt construction and
// strict validation/normalization of the model's JSON reply. The actual
// Anthropic call lives in services/ai/AiAssistantService.ts (desktop, user key)
// and app/api/ai/parse/route.ts (web proxy).

export type AiCategoryContext = { id: string; label: string; kind: "INCOME" | "EXPENSE" };
export type AiAccountContext = { id: string; name: string };

// The minimal data slice sent to the model — only what it needs to pick a
// category/account and resolve a relative date. No transaction history, no
// balances. Keep this lean: it is what leaves the device for the AI service.
export type AiParseContext = {
  today: string; // YYYY-MM-DD
  currency: string;
  categories: AiCategoryContext[];
  accounts: AiAccountContext[];
};

export type AiTransactionDraft = {
  amount: number;
  type: "INCOME" | "EXPENSE";
  date: string; // YYYY-MM-DD
  description: string | null;
  categoryId: string | null;
  accountId: string | null;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// What we accept back from the model before resolving ids against the context.
const rawDraftSchema = z.object({
  amount: z.coerce.number().finite().positive(),
  type: z.enum(["INCOME", "EXPENSE"]),
  date: z.string().optional().nullable(),
  description: z.string().trim().max(180).optional().nullable(),
  categoryId: z.string().optional().nullable(),
  accountId: z.string().optional().nullable()
});

export function buildParsePrompt(
  text: string,
  context: AiParseContext
): { system: string; user: string } {
  const categoryLines = context.categories
    .map((c) => `- ${c.id} | ${c.label} | ${c.kind === "INCOME" ? "доход" : "расход"}`)
    .join("\n");
  const accountLines = context.accounts.map((a) => `- ${a.id} | ${a.name}`).join("\n");

  const system = [
    "Ты помощник для ввода финансовых операций на русском языке.",
    "По короткому описанию пользователя выдели одну операцию и верни ТОЛЬКО JSON-объект,",
    "без markdown, без пояснений, без обёртки в ```.",
    "Поля JSON:",
    '- "amount": число больше 0 (сумма операции),',
    '- "type": "EXPENSE" для траты или "INCOME" для дохода,',
    '- "date": дата в формате YYYY-MM-DD (если не указана — сегодняшняя),',
    '- "description": краткое описание или null,',
    '- "categoryId": id категории из списка ниже (подходящего типа) или null, если ничего не подходит,',
    '- "accountId": id счёта из списка ниже или null, если не указан.',
    "Используй только id из предоставленных списков. Не придумывай id.",
    `Валюта по умолчанию: ${context.currency}. Сегодня: ${context.today}.`,
    "",
    "Категории (id | название | тип):",
    categoryLines || "(нет категорий)",
    "",
    "Счета (id | название):",
    accountLines || "(нет счетов)"
  ].join("\n");

  return { system, user: text.trim() };
}

// Extracts the first JSON object from the model reply, tolerating code fences
// or leading/trailing prose, then validates and resolves ids against context.
export function parseTransactionDraft(
  rawText: string,
  context: AiParseContext
): AiTransactionDraft {
  const json = extractJsonObject(rawText);
  if (!json) {
    throw new Error("Не удалось распознать ответ ассистента.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Не удалось распознать ответ ассистента.");
  }

  const draft = rawDraftSchema.parse(parsed);

  const date = draft.date && ISO_DATE.test(draft.date) ? draft.date : context.today;

  // Only accept ids that exist in the context and match the operation type.
  const category = context.categories.find(
    (c) => c.id === draft.categoryId && c.kind === draft.type
  );
  const account = context.accounts.find((a) => a.id === draft.accountId);

  const description = draft.description?.trim();

  return {
    amount: Math.round(draft.amount * 100) / 100,
    type: draft.type,
    date,
    description: description ? description : null,
    categoryId: category?.id ?? null,
    accountId: account?.id ?? null
  };
}

function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}
