import { answerLanguageInstruction, type AiLocale } from "@/lib/ai/lang";

// "Financial coach": a structured written review of the user's finances, grounded
// strictly in the pre-computed summary (lib/ai/finance-summary). Free-text reply
// (advisory), so no JSON parsing. Network-free and unit-testable.

export function buildReviewPrompt(
  summary: string,
  locale: AiLocale
): { system: string; user: string } {
  const system = [
    "You are a pragmatic personal-finance coach inside a budgeting app.",
    "Base your review STRICTLY on the provided summary — never invent numbers.",
    "Structure the answer in three short sections:",
    "1) What's going well; 2) What to watch; 3) Top 3 concrete next actions.",
    "Be specific and concise. No guarantees, no investment/legal advice — this is guidance.",
    answerLanguageInstruction(locale)
  ].join(" ");

  const user = ["User's finance summary:", summary.trim()].join("\n");

  return { system, user };
}
