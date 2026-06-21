// Lightweight, transparent auto-categorization: matches a new transaction's
// description against the descriptions of past transactions by keyword overlap
// and returns the category most strongly associated with those matches.
//
// It learns purely from the user's own history (no external lists), so the
// suggestion improves as more transactions are entered. Returns null when
// there is nothing confident to suggest.

import { matchRule, type CategorizationRule } from "@/lib/categorization-rules";

export type SuggestHistoryItem = {
  description?: string | null;
  type?: "INCOME" | "EXPENSE";
  category: { id: string };
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3);
}

export function suggestCategoryId(
  description: string,
  history: SuggestHistoryItem[],
  options?: { type?: "INCOME" | "EXPENSE"; rules?: CategorizationRule[] }
): string | null {
  // User rules win over the history heuristic.
  if (options?.rules && options.rules.length > 0) {
    const ruled = matchRule(description, options.rules);
    if (ruled) return ruled;
  }

  const tokens = new Set(tokenize(description));
  if (tokens.size === 0) return null;

  const scores = new Map<string, number>();
  for (const item of history) {
    if (options?.type && item.type && item.type !== options.type) continue;
    const itemTokens = tokenize(item.description ?? "");
    let overlap = 0;
    for (const token of itemTokens) {
      if (tokens.has(token)) overlap += 1;
    }
    if (overlap === 0) continue;
    scores.set(item.category.id, (scores.get(item.category.id) ?? 0) + overlap);
  }

  let best: string | null = null;
  let bestScore = 0;
  for (const [categoryId, score] of scores) {
    if (score > bestScore) {
      best = categoryId;
      bestScore = score;
    }
  }
  return best;
}
