"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";

import { isDesktopShell } from "@/lib/updates/desktop";

/**
 * Рамка окна Windows — заголовок с крестиком — рисуется системой, а не
 * страницей, и тему страницы она не видит. В тёмной теме над тёмным
 * приложением висела белая полоса. Tauri умеет сказать системе, какую тему
 * держать окну, — говорим каждый раз, когда тема меняется.
 */
export function WindowTheme() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (!isDesktopShell() || !resolvedTheme) return;
    const theme = resolvedTheme === "dark" ? "dark" : "light";
    void import("@tauri-apps/api/window")
      .then(({ getCurrentWindow }) => getCurrentWindow().setTheme(theme))
      .catch(() => {
        /* старое окно без разрешения — рамка останется системной */
      });
  }, [resolvedTheme]);

  return null;
}
