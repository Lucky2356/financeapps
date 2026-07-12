import { z } from "zod";

import { extractJsonArray } from "@/lib/ai/extract-json";
import { answerLanguageInstruction, type AiLocale } from "@/lib/ai/lang";

// AI batch categorization: given a list of uncategorized/ambiguous transactions
// and the available categories, the model returns a category id for each one it
// is confident about. Pure prompt building + strict validation of the reply
// (only known ids, matching the transaction's income/expense kind). Network-free.

export type BatchItem = { id: string; description: string; type: "INCOME" | "EXPENSE" };
export type BatchCategory = { id: string; label: string; kind: "INCOME" | "EXPENSE" };
export type BatchSuggestion = { id: string; categoryId: string };

export function buildCategorizePrompt(
  items: BatchItem[],
  categories: BatchCategory[],
  locale: AiLocale
): { system: string; user: string } {
  const categoryLines = categories
    .map((c) => `- ${c.id} | ${c.label} | ${c.kind === "INCOME" ? "INCOME" : "EXPENSE"}`)
    .join("\n");
  const itemLines = items
    .map((it) => `- ${it.id} | ${it.type} | ${it.description || "(no description)"}`)
    .join("\n");

  const system = [
    "You assign a category to each bank transaction using ONLY the categories provided.",
    "Match the category kind to the transaction type (INCOME vs EXPENSE).",
    'Return ONLY a JSON array of objects: [{"id":"<transaction id>","categoryId":"<category id>"}].',
    "Include an item ONLY when you are reasonably confident; omit anything unclear.",
    "Use only ids from the lists. No prose, no code fences.",
    // The answer is machine-parsed, so language only affects nothing here, but keep
    // consistent behaviour across assistants.
    answerLanguageInstruction(locale)
  ].join(" ");

  const user = [
    "Categories (id | label | kind):",
    categoryLines || "(none)",
    "",
    "Transactions (id | type | description):",
    itemLines || "(none)"
  ].join("\n");

  return { system, user };
}

const replySchema = z.array(z.object({ id: z.string().min(1), categoryId: z.string().min(1) }));

// Validates the model reply against the input: only keeps suggestions whose id is
// a real transaction in the batch and whose category exists AND matches the
// transaction's income/expense kind. Deduplicates by transaction id.
export function parseCategorizeReply(
  rawText: string,
  items: BatchItem[],
  categories: BatchCategory[]
): BatchSuggestion[] {
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

  const itemById = new Map(items.map((it) => [it.id, it]));
  const catById = new Map(categories.map((c) => [c.id, c]));
  const seen = new Set<string>();
  const out: BatchSuggestion[] = [];

  for (const row of result.data) {
    if (seen.has(row.id)) continue;
    const item = itemById.get(row.id);
    const cat = catById.get(row.categoryId);
    if (!item || !cat) continue;
    if (cat.kind !== item.type) continue; // never assign an income category to an expense
    seen.add(row.id);
    out.push({ id: row.id, categoryId: row.categoryId });
  }
  return out;
}
