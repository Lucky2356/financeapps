"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";

import { apiClient } from "@/lib/api/client";
import { themeChosenThisSession } from "@/lib/theme-preference";
import { useDataVersion } from "@/hooks/use-data-version";

// Applies interface density globally by scaling the root font size.
// Tailwind spacing/typography is rem-based, so this proportionally tightens
// paddings, gaps and text across the whole app.
//
// Размер задаёт CSS по атрибуту (app/globals.css), а не встроенный стиль.
// Встроенный `font-size: 16px` на <html> перебивал любое правило, и
// «Крупный текст» в настройках не менял ничего. Плотность и крупный текст —
// два атрибута, и их сочетание CSS знает.
export function applyDensity(density: "comfortable" | "compact") {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.density = density;
  root.style.removeProperty("font-size");
}

// On load, reads persisted settings and applies theme + density everywhere.
// In web/dev mode the settings request fails silently (no DB) and nothing breaks.
//
// И перечитывает при каждом изменении книги: тему и плотность, выбранные на
// другом устройстве, приносит синхронизация — без этого они применялись бы
// только после перезапуска. Выбор, сделанный здесь в этом сеансе, по-прежнему
// главнее (themeChosenThisSession).
export function AppSettingsSync() {
  const { setTheme } = useTheme();
  const version = useDataVersion();

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get("/settings")
      .then((settings) => {
        if (cancelled) return;
        // Never overwrite a choice the user made while this read was in flight:
        // reading IndexedDB takes long enough that someone can open Settings and
        // pick a theme first, and applying the stored value here used to snap it
        // straight back.
        if (settings.theme && !themeChosenThisSession()) setTheme(settings.theme);
        applyDensity(settings.density ?? "comfortable");
      })
      .catch(() => {
        /* settings unavailable (e.g. web mode without DB) — keep defaults */
      });
    return () => {
      cancelled = true;
    };
  }, [setTheme, version]);

  return null;
}
