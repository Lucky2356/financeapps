// AI providers and models offered in the assistant settings. Kept free of any
// SDK import so the settings UI can read the list without pulling a provider SDK
// into the client bundle. The desktop app lets the user pick a provider + model
// + reasoning depth and supply their own key; the web app is configured by the
// owner via env.

export type AiProvider = "anthropic" | "openai" | "deepseek";

export type AiModelOption = { id: string; label: string };

// User-facing "thinking depth". Mapped per provider in AiAssistantService:
//   OpenAI    → reasoning_effort (low | medium | high),
//   Anthropic → extended thinking on "high",
//   DeepSeek  → V4 thinks by default (no per-request knob).
export type AiEffort = "low" | "medium" | "high";

export type AiProviderInfo = {
  id: AiProvider;
  label: string;
  /** i18n key for a "where to get an API key" hint. */
  keyHintKey: string;
  defaultModel: string;
  models: AiModelOption[];
};

export const AI_PROVIDERS: AiProviderInfo[] = [
  {
    id: "anthropic",
    label: "Claude (Anthropic)",
    keyHintKey: "set.ai.key.hint.anthropic",
    defaultModel: "claude-opus-4-8",
    models: [
      { id: "claude-opus-4-8", label: "Opus 4.8 — максимальное качество" },
      { id: "claude-sonnet-4-6", label: "Sonnet 4.6 — баланс скорости и цены" },
      { id: "claude-haiku-4-5", label: "Haiku 4.5 — самый быстрый и дешёвый" }
    ]
  },
  {
    id: "openai",
    label: "ChatGPT (OpenAI)",
    keyHintKey: "set.ai.key.hint.openai",
    defaultModel: "gpt-5.4-mini",
    models: [
      { id: "gpt-5.5", label: "GPT-5.5 — флагман" },
      { id: "gpt-5.4", label: "GPT-5.4 — мощный" },
      { id: "gpt-5.4-mini", label: "GPT-5.4 mini — быстрый и дешёвый" },
      { id: "gpt-5.4-nano", label: "GPT-5.4 nano — самый лёгкий" }
    ]
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    keyHintKey: "set.ai.key.hint.deepseek",
    defaultModel: "deepseek-v4-flash",
    models: [
      { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash — быстрый и дешёвый" },
      { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro — для сложных задач" }
    ]
  }
];

export const AI_DEFAULT_PROVIDER: AiProvider = "anthropic";
export const AI_DEFAULT_MODEL = "claude-opus-4-8";
export const AI_DEFAULT_EFFORT: AiEffort = "medium";
export const AI_EFFORTS: AiEffort[] = ["low", "medium", "high"];

export function providerInfo(id: string | undefined): AiProviderInfo {
  return AI_PROVIDERS.find((provider) => provider.id === id) ?? AI_PROVIDERS[0];
}

// Infer the provider from a model id, so callers that only stored a model still
// route to the right SDK.
export function providerForModel(model: string | undefined): AiProvider {
  const match = AI_PROVIDERS.find((provider) => provider.models.some((m) => m.id === model));
  return match?.id ?? AI_DEFAULT_PROVIDER;
}

// Coerce any stored/env value to a valid effort, defaulting to "medium".
export function normalizeEffort(value: string | undefined): AiEffort {
  return value === "low" || value === "high" ? value : AI_DEFAULT_EFFORT;
}
