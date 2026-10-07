"use client";

import { useEffect, useState } from "react";

import { apiClient } from "@/lib/api/client";
import type { SettingsPageData } from "@/lib/data";
import { useDataVersion } from "@/hooks/use-data-version";

// Loads the persisted settings so AI components can gate themselves on
// `aiEnabled` and read the desktop key/provider/model/effort. Returns null until
// loaded (or if settings are unavailable, e.g. web without a DB). Re-read on
// every change of the book: switched on in Settings, the AI features appear on
// screens that are already open.
export function useAiSettings(): SettingsPageData | null {
  const [settings, setSettings] = useState<SettingsPageData | null>(null);
  const version = useDataVersion();
  useEffect(() => {
    let cancelled = false;
    apiClient
      .get("/settings")
      .then((data) => {
        if (!cancelled) setSettings(data);
      })
      .catch(() => {
        /* settings unavailable — stay null (feature hidden) */
      });
    return () => {
      cancelled = true;
    };
  }, [version]);
  return settings;
}
