// User-defined auto-categorization rules: "if the description contains X, use
// category Y". Rules take priority over the history-based keyword suggestion, so
// the user can pin reliable mappings (e.g. "Пятёрочка" → Продукты). Pure.

export type CategorizationRule = {
  id: string;
  /** Case-insensitive substring matched against the transaction description. */
  match: string;
  categoryId: string;
};

export function matchRule(description: string, rules: CategorizationRule[]): string | null {
  const text = description.trim().toLowerCase();
  if (!text) return null;
  for (const rule of rules) {
    const needle = rule.match.trim().toLowerCase();
    if (needle && text.includes(needle)) return rule.categoryId;
  }
  return null;
}
