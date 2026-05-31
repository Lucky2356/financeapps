"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api/client";
import { runtimeConfig } from "@/lib/platform/env";

const isLocalDesktop =
  runtimeConfig.platform === "desktop" && runtimeConfig.desktopDataMode === "local";

export function ThemeToggle() {
  // resolvedTheme reflects what is actually on screen (resolving "system"),
  // so every click reliably flips the *visible* theme — using `theme` here
  // caused a dead first click while on the default "system" setting.
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  function toggle() {
    const next = isDark ? "light" : "dark";
    setTheme(next);
    // Persist so AppSettingsSync doesn't revert it from IndexedDB on reload.
    if (isLocalDesktop) {
      void apiClient.put("/settings", { theme: next }).catch(() => {});
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label="Переключить тему"
      title="Переключить тему"
      onClick={toggle}
    >
      <Sun className="hidden size-4 dark:block" />
      <Moon className="size-4 dark:hidden" />
    </Button>
  );
}
