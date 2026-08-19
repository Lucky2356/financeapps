"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api/client";
import { buildNotifications } from "@/lib/notifications";
import { translate } from "@/lib/i18n/catalog";
import { getClientLocale } from "@/lib/i18n/client-locale";
import { isAndroidShell } from "@/lib/platform/device";
import { isDesktopShell } from "@/lib/updates/desktop";
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

  // Refresh FX rates from the CBR feed once per day. The Tauri webview has
  // cbr.ru CSP-allow-listed; keeps cross-currency capital honest, and a failure
  // simply keeps the cached rates.
  if (isFxStale(settings.currencyRatesUpdatedAt)) {
    try {
      const { fetchCbrRates } = await import("@/services/market/FxRatesProvider");
      const rates = await fetchCbrRates();
      await apiClient.post("/fx", { rates });
    } catch {
      // Offline or feed error — keep the last-known cached rates.
    }
  }

  // Android has no in-place updater, so the app looks for a newer release
  // itself and says so. Installing stays a deliberate act: the toast opens the
  // APK, and Android's own installer asks for confirmation.
  if (isAndroidShell()) {
    try {
      const {
        checkAndroidUpdate,
        markAnnounced,
        markChecked,
        shouldAnnounce,
        shouldCheckNow,
        startAndroidUpdate
      } = await import("@/lib/updates/android");
      if (shouldCheckNow()) {
        const update = await checkAndroidUpdate();
        // Marked only after the request came back: a failed check used to cost
        // a whole day of silence.
        markChecked();
        if (update && shouldAnnounce(update.version)) {
          markAnnounced(update.version);
          const locale = getClientLocale();
          toast.message(translate(locale, "set.update.available", { version: update.version }), {
            duration: 15_000,
            action: {
              label: translate(locale, "set.update.confirmLabel"),
              onClick: () => void startAndroidUpdate(update)
            }
          });
        }
      }
    } catch {
      // Offline or GitHub unreachable — silence is right here; the owner can
      // still check by hand from Settings.
    }
  }

  // Windows has the in-place updater, but nothing was asking it anything: the
  // app only looked for a new build when the owner opened Settings and pressed
  // the button. That is why a PC sat two releases behind while the phone kept
  // itself current — the phone had this very check and the desktop did not.
  if (isDesktopShell()) {
    try {
      const { checkDesktopUpdate } = await import("@/lib/updates/desktop");
      const { markAnnounced, markChecked, shouldAnnounce, shouldCheckNow } =
        await import("@/lib/updates/schedule");
      if (shouldCheckNow("desktop")) {
        const update = await checkDesktopUpdate();
        // Marked only after the request came back, so a failed check costs the
        // next start, not the next six hours.
        markChecked("desktop");
        if (update && shouldAnnounce("desktop", update.version)) {
          markAnnounced("desktop", update.version);
          const locale = getClientLocale();
          toast.message(translate(locale, "set.update.available", { version: update.version }), {
            duration: 15_000,
            action: {
              label: translate(locale, "set.update.confirmLabel"),
              onClick: () => {
                toast.info(translate(locale, "set.update.downloading"));
                void update.install();
              }
            }
          });
        }
      }
    } catch {
      // Offline or GitHub unreachable — silence is right for a check nobody
      // asked for; the button in Settings still reports the reason out loud.
    }
  }

  // Record today's net worth snapshot once per load (plan B7) — best-effort,
  // both web and desktop. Builds an accurate capital history going forward.
  try {
    await apiClient.post("/networth/snapshot");
  } catch {
    // Ignore (offline / unauthenticated).
  }

  // Scheduled local backup: if a backup is due per the user's chosen cadence,
  // write a timestamped snapshot to their folder and rotate.
  try {
    const { loadAutoBackupConfig, getLastBackupRun, setLastBackupRun, runAutoBackup } =
      await import("@/lib/backup/AutoBackupService");
    const { shouldRunAutoBackup } = await import("@/lib/backup/auto-backup");
    const config = loadAutoBackupConfig();
    if (config.folder && shouldRunAutoBackup(config.frequency, getLastBackupRun())) {
      await runAutoBackup(config);
      setLastBackupRun(new Date().toISOString());
    }
  } catch {
    // Best-effort; a failed backup must not break app startup.
  }

  if (settings.autoMaterializeRecurring) {
    try {
      // Auto-post every template whose due date has arrived.
      await apiClient.post("/recurring/materialize-all");
    } catch {
      // Best-effort; ignore failures (e.g. no accounts yet).
    }

    try {
      // Debts with auto-payment enabled: post the monthly payment once the due
      // day has passed and reduce the balance (idempotent per month — see
      // lib/debts/auto-pay).
      await apiClient.post("/debts/auto-pay");
    } catch {
      // Best-effort; ignore failures.
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
        currency: forecast?.currency ?? budgets?.currency,
        locale: getClientLocale()
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
