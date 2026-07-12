import { z } from "zod";

import { extractJsonArray } from "@/lib/ai/extract-json";
import { answerLanguageInstruction, type AiLocale } from "@/lib/ai/lang";

// AI budget planner: proposes a monthly spending limit per expense category from
// the user's recent average spend and income. Pure prompt + strict validation
// (only known category ids, positive limits). Network-free.

export type BudgetCategoryInput = {
  categoryId: string;
  label: string;
  avgMonthly: number; // average monthly spend, same currency
};

export type BudgetSuggestion = {
  categoryId: string;
  limit: number;
  rationale: string;
};

export function buildBudgetPlanPrompt(
  categories: BudgetCategoryInput[],
  avgMonthlyIncome: number,
  currency: string,
  locale: AiLocale
): { system: string; user: string } {
  const lines = categories
    .map((c) => `- ${c.categoryId} | ${c.label} | avg ${Math.round(c.avgMonthly)} ${currency}/mo`)
    .join("\n");

  const system = [
    "You are a budgeting assistant. Propose a realistic MONTHLY spending limit for each expense category.",
    "Keep total limits at or below income; trim clearly excessive categories, keep essentials sane.",
    'Return ONLY a JSON array: [{"categoryId":"<id>","limit":<number>,"rationale":"<short reason>"}].',
    "Use only the category ids provided. Limits are numbers in the given currency, no separators.",
    "Write each rationale in one short sentence. No prose outside the JSON, no code fences.",
    answerLanguageInstruction(locale)
  ].join(" ");

  const user = [
    `Average monthly income: ${Math.round(avgMonthlyIncome)} ${currency}.`,
    "Expense categories (id | label | average monthly spend):",
    lines || "(none)"
  ].join("\n");

  return { system, user };
}

const replySchema = z.array(
  z.object({
    categoryId: z.string().min(1),
    limit: z.coerce.number().finite().positive(),
    rationale: z.string().trim().max(240).optional().default("")
  })
);

export function parseBudgetPlan(
  rawText: string,
  categories: BudgetCategoryInput[]
): BudgetSuggestion[] {
  const json = extractJsonArray(rawText);
  if (!json) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  const result = replySchema.safeParse(parsed);
  if (!result.success) return [];

  const valid = new Set(categories.map((c) => c.categoryId));
  const seen = new Set<string>();
  const out: BudgetSuggestion[] = [];
  for (const row of result.data) {
    if (!valid.has(row.categoryId) || seen.has(row.categoryId)) continue;
    seen.add(row.categoryId);
    out.push({
      categoryId: row.categoryId,
      limit: Math.round(row.limit),
      rationale: row.rationale
    });
  }
  return out;
}
