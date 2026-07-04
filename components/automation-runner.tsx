"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { apiClient } from "@/lib/api/client";
import { isLocalDesktopMode } from "@/lib/platform/env";
import { isPublicPath } from "@/lib/public-paths";
import { buildNotifications } from "@/lib/notifications";
import type { BudgetsPageData, SettingsPageData } from "@/lib/data";
import type { DashboardData, ForecastData } from "@/types/finance";

// True when the cached FX rates are missing or not from today (local date).
function isFxStale(updatedAt: string | null | undefined): boolean {
  if (!updatedAt) return true;
  const then = new Date(updatedAt);
  if (Number.isNaN(then.getTime())) return true;
  const day = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  return day(then) !== day(new Date());
}

// Runs opt-in automation once per app load: refreshes FX rates (desktop),
// auto-posts due recurring payments, and fires system notifications for urgent
// items (cash gaps, budget overruns, payments due soon). Uses the Web
// Notification API so it works in the browser and the Tauri webview without a
// native plugin. Renders nothing.
export function AutomationRunner() {
  const ran = useRef(false);
  const pathname = usePathname();

  useEffect(() => {
    if (ran.current) return;
    // Skip on public auth pages (login/register/legal): there is no session, so
    // the snapshot/materialize calls would just 401.
    if (isPublicPath(pathname)) return;
    ran.current = true;
    void runAutomation();
  }, [pathname]);

  return null;
}

async function runAutomation() {
  let settings: SettingsPageData;
  try {
    settings = await apiClient.get<SettingsPageData>("/settings");
  } catch {
    return;
  }

  // Refresh FX rates from the CBR feed once per day (desktop only — the browser
  // can't fetch cbr.ru cross-origin, and the Tauri webview has it CSP-allow-
  // listed). Keeps cross-currency capital honest; failures keep cached rates.
  if (isLocalDesktopMode && isFxStale(settings.currencyRatesUpdatedAt)) {
    try {
      const { fetchCbrRates } = await import("@/services/market/FxRatesProvider");
      const rates = await fetchCbrRates();
      await apiClient.post("/fx", { rates });
    } catch {
      // Offline or feed error — keep the last-known cached rates.
    }
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

      // Reuse the same three sources as the in-app bell and the same aggregation
      // (buildNotifications): cash-gap warnings, budget overruns and payments due
      // soon. Fire a system notification for the urgent ones (WARNING/CRITICAL),
      // deduped per day so opening the app repeatedly does not re-notify.
      const [dashboard, forecast, budgets] = await Promise.all([
        apiClient.get<Pick<DashboardData, "recommendations">>("/dashboard").catch(() => null),
        apiClient
          .get<Pick<ForecastData, "upcomingEvents" | "warnings" | "currency">>("/forecast")
          .catch(() => null),
        apiClient.get<BudgetsPageData>("/budgets").catch(() => null)
      ]);

      const urgent = buildNotifications({
        recommendations: dashboard?.recommendations,
        upcomingEvents: forecast?.upcomingEvents,
        forecastWarnings: forecast?.warnings,
        budgets: budgets?.budgets,
        currency: forecast?.currency ?? budgets?.currency
      }).filter((item) => item.severity === "WARNING" || item.severity === "CRITICAL");

      const fresh = urgent.filter((item) => !alreadyNotified(item.id)).slice(0, 3);
      for (const item of fresh) {
        new Notification(item.title, { body: item.description });
        markNotified(item.id);
      }
    } catch {
      // Notification unavailable or denied — ignore.
    }
  }
}

// Per-day dedupe for system notifications, backed by localStorage. Resets when
// the local date changes so each actionable item notifies at most once a day.
const NOTIFY_KEY = "notif-fired";

function notifyState(): { date: string; ids: string[] } {
  const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local
  try {
    const raw = JSON.parse(localStorage.getItem(NOTIFY_KEY) ?? "{}") as {
      date?: string;
      ids?: string[];
    };
    if (raw.date === today && Array.isArray(raw.ids)) return { date: today, ids: raw.ids };
  } catch {
    /* corrupt/empty — start fresh */
  }
  return { date: today, ids: [] };
}

function alreadyNotified(id: string): boolean {
  return notifyState().ids.includes(id);
}

function markNotified(id: string): void {
  const state = notifyState();
  if (!state.ids.includes(id)) state.ids.push(id);
  try {
    localStorage.setItem(NOTIFY_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable — best effort */
  }
}
