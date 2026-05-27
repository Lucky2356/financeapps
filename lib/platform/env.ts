import type { ApiMode, AppEnvironment, AppPlatform, DesktopDataMode, RuntimeConfig } from "@/types/platform";

function oneOf<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export function getRuntimeConfig(): RuntimeConfig {
  return {
    platform: oneOf<AppPlatform>(process.env.NEXT_PUBLIC_APP_PLATFORM, ["web", "android", "desktop"], "web"),
    environment: oneOf<AppEnvironment>(process.env.NEXT_PUBLIC_APP_ENV, ["development", "production"], "development"),
    apiMode: oneOf<ApiMode>(process.env.NEXT_PUBLIC_API_MODE, ["cloud", "local", "mock"], "cloud"),
    apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL || "/api",
    desktopDataMode: oneOf<DesktopDataMode>(process.env.NEXT_PUBLIC_DESKTOP_DATA_MODE, ["cloud", "local"], "cloud"),
    isStaticExport: process.env.NEXT_OUTPUT === "export"
  };
}

export const runtimeConfig = getRuntimeConfig();
