"use client";

import { useEffect, useState } from "react";

import { apiClient } from "@/lib/api/client";
import type { SettingsPageData } from "@/lib/data";

// Loads the persisted settings once so AI components can gate themselves on
// `aiEnabled` and read the desktop key/provider/model/effort. Returns null until
// loaded (or if settings are unavailable, e.g. web without a DB).
export function useAiSettings(): SettingsPageData | null {
  const [settings, setSettings] = useState<SettingsPageData | null>(null);
  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<SettingsPageData>("/settings")
      .then((data) => {
        if (!cancelled) setSettings(data);
      })
      .catch(() => {
        /* settings unavailable — stay null (feature hidden) */
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return settings;
}
