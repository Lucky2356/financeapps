// Popular Claude models offered in the AI assistant settings (plan D3).
// Kept here (not in AiAssistantService) so the settings UI can import the list
// without pulling the Anthropic SDK into the client bundle.

export const AI_DEFAULT_MODEL = "claude-opus-4-8";

export const AI_MODELS = [
  { id: "claude-opus-4-8", label: "Opus 4.8 — максимальное качество (по умолчанию)" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6 — баланс скорости и стоимости" },
  { id: "claude-haiku-4-5", label: "Haiku 4.5 — самый быстрый и дешёвый" },
  { id: "claude-opus-4-7", label: "Opus 4.7 — предыдущий флагман" },
  { id: "claude-fable-5", label: "Fable 5 — самый мощный (дороже)" }
] as const;
