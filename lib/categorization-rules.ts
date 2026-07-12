// User-defined auto-categorization rules: "if the description contains X, use
// category Y". Rules take priority over the history-based keyword suggestion, so
// the user can pin reliable mappings (e.g. "Пятёрочка" → Продукты). Pure.
//
// Matching is normalization-tolerant (see lib/text/normalize): case, ё/е, extra
// spaces, punctuation, card masks and digits are all ignored, so a sloppily
// written rule still fires on real bank descriptions. A rule's `match` may list
// several alternatives separated by comma/semicolon — any one is enough.

import { normalizeForMatch, splitRuleKeys } from "@/lib/text/normalize";

export type CategorizationRule = {
  id: string;
  /** Case/spelling-insensitive keyword(s) matched against the description. */
  match: string;
  categoryId: string;
};

export function matchRule(description: string, rules: CategorizationRule[]): string | null {
  const text = normalizeForMatch(description);
  if (!text) return null;
  for (const rule of rules) {
    for (const key of splitRuleKeys(rule.match)) {
      if (text.includes(key)) return rule.categoryId;
    }
  }
  return null;
}
