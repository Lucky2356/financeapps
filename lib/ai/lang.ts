// Locale → a short instruction telling the model which language to answer in, so
// AI replies follow the app's interface language (RU/EN). Prompt scaffolding
// stays English-neutral; only the answer language is switched.

export type AiLocale = "ru" | "en";

export function answerLanguageInstruction(locale: AiLocale): string {
  return locale === "en" ? "Answer in English." : "Отвечай на русском языке.";
}
