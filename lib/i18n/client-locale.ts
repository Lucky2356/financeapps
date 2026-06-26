import { DEFAULT_LOCALE, LOCALES, type Locale } from "@/lib/i18n/catalog";

const STORAGE_KEY = "app-locale";

// Resolves the locale on the desktop client (LocalApiClient runs in the browser),
// reading the same localStorage key the I18nProvider writes. Safe everywhere:
// falls back to the default when storage is unavailable or on the server.
export function getClientLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return (LOCALES as readonly string[]).includes(saved ?? "")
      ? (saved as Locale)
      : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}
