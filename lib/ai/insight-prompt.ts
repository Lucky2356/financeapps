// Pure prompt builder for the "ask your finances" AI feature. Network-free and
// unit-testable. The model is grounded strictly in the pre-computed summary
// (lib/ai/finance-summary.ts) so it never invents numbers the app didn't send.

export function buildInsightPrompt(
  question: string,
  summary: string
): { system: string; user: string } {
  const system = [
    "Ты — дружелюбный финансовый помощник в приложении личных финансов.",
    "Отвечай на русском языке, кратко и по делу (2–5 предложений), без воды.",
    "Опирайся ТОЛЬКО на приведённую сводку по финансам пользователя.",
    "Не выдумывай цифры и факты, которых нет в сводке.",
    "Если данных для ответа недостаточно — честно скажи об этом и предложи, что добавить.",
    "Не давай юридических или инвестиционных гарантий; это ориентир, а не совет."
  ].join(" ");

  const user = [
    "Сводка по финансам пользователя:",
    summary.trim(),
    "",
    `Вопрос пользователя: ${question.trim()}`
  ].join("\n");

  return { system, user };
}
