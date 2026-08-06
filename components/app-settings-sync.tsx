"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";

import { apiClient } from "@/lib/api/client";
import type { SettingsPageData } from "@/lib/data";
import { themeChosenThisSession } from "@/lib/theme-preference";

// Applies interface density globally by scaling the root font size.
// Tailwind spacing/typography is rem-based, so this proportionally tightens
// paddings, gaps and text across the whole app.
export function applyDensity(density: "comfortable" | "compact") {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.density = density;
  root.style.fontSize = density === "compact" ? "14px" : "16px";
}

// On load, reads persisted settings and applies theme + density everywhere.
// In web/dev mode the settings request fails silently (no DB) and nothing breaks.
export function AppSettingsSync() {
  const { setTheme } = useTheme();

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<SettingsPageData>("/settings")
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
  }, [setTheme]);

  return null;
}
