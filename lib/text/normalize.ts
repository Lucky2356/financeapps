// Text normalization shared by auto-categorization (rules + history heuristic).
// Makes matching robust to "messy" input: different case, ё/е, extra spaces,
// punctuation, card masks and digits. So a rule "Пятёрочка" matches a bank
// description "ПЯТЕРОЧКА №1234 МОСКВА" and vice versa.
//
// Keeps letters (any script) and spaces; everything else becomes a space.
export function normalizeForMatch(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\[transfer:[^\]]*\]/g, " ")
    .replace(/[0-9]+/g, " ")
    .replace(/[^\p{L}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Splits a rule's `match` field into individual keywords. A single rule may hold
// several alternatives separated by comma or semicolon ("мтс, мобильная связь")
// — any one of them matching is enough.
export function splitRuleKeys(match: string): string[] {
  return match
    .split(/[,;]+/)
    .map((part) => normalizeForMatch(part))
    .filter((part) => part.length > 0);
}
