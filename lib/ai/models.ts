// AI providers and models offered in the assistant settings. Kept free of any
// SDK import so the settings UI can read the list without pulling a provider SDK
// into the client bundle. The desktop app lets the user pick a provider + model
// and supply their own key; the web app is configured by the owner via env.

export type AiProvider = "anthropic" | "openai" | "deepseek";

export type AiModelOption = { id: string; label: string };

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
      { id: "claude-haiku-4-5", label: "Haiku 4.5 — самый быстрый и дешёвый" },
      { id: "claude-opus-4-7", label: "Opus 4.7 — предыдущий флагман" }
    ]
  },
  {
    id: "openai",
    label: "ChatGPT (OpenAI)",
    keyHintKey: "set.ai.key.hint.openai",
    defaultModel: "gpt-4o",
    models: [
      { id: "gpt-4o", label: "GPT-4o — универсальный" },
      { id: "gpt-4o-mini", label: "GPT-4o mini — быстрый и дешёвый" },
      { id: "gpt-4.1", label: "GPT-4.1" },
      { id: "gpt-4.1-mini", label: "GPT-4.1 mini" }
    ]
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    keyHintKey: "set.ai.key.hint.deepseek",
    defaultModel: "deepseek-chat",
    models: [
      { id: "deepseek-chat", label: "DeepSeek-V3 (chat)" },
      { id: "deepseek-reasoner", label: "DeepSeek-R1 (reasoner)" }
    ]
  }
];

export const AI_DEFAULT_PROVIDER: AiProvider = "anthropic";
export const AI_DEFAULT_MODEL = "claude-opus-4-8";

export function providerInfo(id: string | undefined): AiProviderInfo {
  return AI_PROVIDERS.find((provider) => provider.id === id) ?? AI_PROVIDERS[0];
}

// Infer the provider from a model id, so callers that only stored a model still
// route to the right SDK.
export function providerForModel(model: string | undefined): AiProvider {
  const match = AI_PROVIDERS.find((provider) => provider.models.some((m) => m.id === model));
  return match?.id ?? AI_DEFAULT_PROVIDER;
}
