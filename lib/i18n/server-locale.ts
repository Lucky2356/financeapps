import { shouldUseBuildFallbackData } from "@/lib/build-mode";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "@/lib/i18n/catalog";

export const LOCALE_COOKIE = "app-locale";

function asLocale(value: string | undefined | null): Locale {
  return (LOCALES as readonly string[]).includes(value ?? "") ? (value as Locale) : DEFAULT_LOCALE;
}

// Resolves the locale on the web server (request handlers / server components)
// from the locale cookie the client mirrors from its language setting. Returns
// the default during the static-export/build pass (no request, and `cookies()`
// would force dynamic rendering) and whenever the cookie is unavailable.
export async function getServerLocale(): Promise<Locale> {
  if (shouldUseBuildFallbackData()) return DEFAULT_LOCALE;
  try {
    const { cookies } = await import("next/headers");
    const store = await cookies();
    return asLocale(store.get(LOCALE_COOKIE)?.value);
  } catch {
    return DEFAULT_LOCALE;
  }
}
