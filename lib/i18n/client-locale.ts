import { DEFAULT_LOCALE, LOCALES, type Locale } from "@/lib/i18n/catalog";

const STORAGE_KEY = "app-locale";

function isLocale(value: string | null | undefined): value is Locale {
  return (LOCALES as readonly string[]).includes(value ?? "");
}

// Resolves the locale on the desktop client (LocalApiClient runs in the browser),
// reading the same localStorage key the I18nProvider writes — and falling back
// to the device language exactly as the provider does. The two used to disagree:
// the interface followed the phone (English), while every string built by the
// API — metric titles, category names — defaulted to Russian, so one screen
// showed both languages at once.
export function getClientLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (isLocale(saved)) return saved;
  } catch {
    /* storage unavailable — fall through to the device language */
  }
  const device = window.navigator?.language?.slice(0, 2).toLowerCase();
  return isLocale(device) ? device : DEFAULT_LOCALE;
}
