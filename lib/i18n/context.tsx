"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { DEFAULT_LOCALE, LOCALES, translate, type Locale } from "@/lib/i18n/catalog";

const STORAGE_KEY = "app-locale";

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

// Resolves the initial locale: saved choice → browser language → default (ru).
function resolveInitialLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (isLocale(saved)) return saved;
  const browser = window.navigator.language?.slice(0, 2).toLowerCase();
  return isLocale(browser) ? browser : DEFAULT_LOCALE;
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  // Start from the default for a stable SSR/first paint, then adopt the saved
  // locale on mount (avoids a hydration mismatch while still honoring the choice).
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    const initial = resolveInitialLocale();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocaleState(initial);
    // Seed the cookie on first load so the web server renders generated content
    // (recommendations, metrics, insights) in the resolved locale even before
    // the user explicitly changes the language setting.
    try {
      document.cookie = `${STORAGE_KEY}=${initial}; path=/; max-age=31536000; samesite=lax`;
    } catch {
      /* document unavailable */
    }
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage unavailable — in-memory only */
    }
    // Mirror to a cookie so the web server (SSR / API routes) can render
    // locale-aware generated content (recommendations, metrics, insights).
    try {
      document.cookie = `${STORAGE_KEY}=${next}; path=/; max-age=31536000; samesite=lax`;
    } catch {
      /* document unavailable */
    }
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key, vars) => translate(locale, key, vars)
    }),
    [locale, setLocale]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    // Defensive fallback so a component used outside the provider (e.g. in a
    // test) still renders Russian instead of throwing.
    return {
      locale: DEFAULT_LOCALE,
      setLocale: () => {},
      t: (key, vars) => translate(DEFAULT_LOCALE, key, vars)
    };
  }
  return ctx;
}
