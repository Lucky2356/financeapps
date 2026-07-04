import { providerInfo, type AiProvider } from "@/lib/ai/models";

// Resolves the AI provider + key + model + effort for the WEB path from env, so
// the browser never sees or chooses them. The owner picks the provider via
// AI_PROVIDER (anthropic | openai | deepseek) and supplies that provider's key.
export function resolveServerProvider(): {
  provider: AiProvider;
  apiKey: string | undefined;
  model: string | undefined;
  effort: string | undefined;
} {
  const provider = providerInfo(process.env.AI_PROVIDER).id;
  const effort = process.env.AI_EFFORT;
  switch (provider) {
    case "openai":
      return {
        provider,
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL,
        effort
      };
    case "deepseek":
      return {
        provider,
        apiKey: process.env.DEEPSEEK_API_KEY,
        model: process.env.DEEPSEEK_MODEL,
        effort
      };
    default:
      return {
        provider,
        apiKey: process.env.ANTHROPIC_API_KEY,
        model: process.env.ANTHROPIC_MODEL,
        effort
      };
  }
}
