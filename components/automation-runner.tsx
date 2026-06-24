"use client";

import { useEffect, useRef } from "react";

import { apiClient } from "@/lib/api/client";
import { formatCurrency } from "@/lib/format";
import type { SettingsPageData } from "@/lib/data";
import type { ForecastData } from "@/types/finance";

// Runs opt-in automation once per app load: auto-posts due recurring payments
// (desktop) and fires a system reminder for payments due today. Uses the Web
// Notification API so it works in the browser and the Tauri webview without a
// native plugin. Renders nothing.
export function AutomationRunner() {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    void runAutomation();
  }, []);

  return null;
}

async function runAutomation() {
  let settings: SettingsPageData;
  try {
    settings = await apiClient.get<SettingsPageData>("/settings");
  } catch {
    return;
  }

  // Record today's net worth snapshot once per load (plan B7) — best-effort,
  // both web and desktop. Builds an accurate capital history going forward.
  try {
    await apiClient.post("/networth/snapshot");
  } catch {
    // Ignore (offline / unauthenticated).
  }

  if (settings.autoMaterializeRecurring) {
    try {
      // Both modes expose /recurring/materialize-all (desktop LocalApiClient,
      // web batch route) — auto-post all due templates once per load.
      await apiClient.post("/recurring/materialize-all");
    } catch {
      // Best-effort; ignore failures (e.g. no accounts yet).
    }
  }

  if (settings.paymentReminders && typeof window !== "undefined" && "Notification" in window) {
    try {
      const permission =
        Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      if (permission !== "granted") return;

      const forecast = await apiClient.get<ForecastData>("/forecast");
      const today = new Date().toISOString().slice(0, 10);
      const dueToday = forecast.upcomingEvents.filter(
        (event) => event.type === "EXPENSE" && event.date.slice(0, 10) === today
      );
      if (dueToday.length === 0) return;

      const total = dueToday.reduce((sum, event) => sum + event.amount, 0);
      new Notification("Платежи сегодня", {
        body: `${dueToday.length} к оплате на сумму ${formatCurrency(total, forecast.currency)}`
      });
    } catch {
      // Notification unavailable or denied — ignore.
    }
  }
}
