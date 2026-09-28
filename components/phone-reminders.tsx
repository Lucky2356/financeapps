"use client";

// Напоминания и виджет на телефоне (Android).
//
// Расписание на неделю вперёд собирается при запуске, после каждой правки
// (с задержкой — правки идут пачками) и при возвращении в приложение, и
// целиком заменяет прежнее (lib/reminders/plan.ts → InstallerPlugin.kt). Туда
// же — «Можно тратить сегодня» для виджета. Вне Android ничего не делает:
// на компьютере срочное показывает AutomationRunner.

import { useEffect } from "react";

import { apiClient } from "@/lib/api/client";
import { onDataChanged } from "@/lib/api/data-events";
import type { Allowance } from "@/lib/analytics/daily-allowance";
import type {
  AccountsPageData,
  BudgetsPageData,
  SettingsPageData,
  TransactionsPageData
} from "@/lib/data";
import { formatCurrency } from "@/lib/format";
import { translate } from "@/lib/i18n/catalog";
import { getClientLocale } from "@/lib/i18n/client-locale";
import {
  askNotifications,
  cancelReminders,
  scheduleReminders,
  updateWidget
} from "@/lib/platform/android-notify";
import { isAndroidShell } from "@/lib/platform/device";
import { planReminders } from "@/lib/reminders/plan";
import { readMine, writeMine } from "@/lib/storage/mine";
import type { ForecastData } from "@/types/finance";

export const EVENING_REMINDER_KEY = "reminder-evening";
const ONCE_KEY = "reminders-once";

/** Вечернее напоминание включено, пока человек его не выключил. */
export function eveningReminderOn(): boolean {
  return readMine(EVENING_REMINDER_KEY) !== "0";
}

let asked = false;

const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
};

export async function refreshPhoneReminders(): Promise<void> {
  if (!isAndroidShell()) return;
  const locale = getClientLocale();
  const t = (key: string, values?: Record<string, string | number>) =>
    translate(locale, key, values);
  const day = today();
  const [settings, forecast, budgets, accounts, todays, allowance] = await Promise.all([
    apiClient.get<SettingsPageData>("/settings").catch(() => null),
    apiClient.get<ForecastData>("/forecast").catch(() => null),
    apiClient.get<BudgetsPageData>("/budgets").catch(() => null),
    apiClient.get<AccountsPageData>("/accounts").catch(() => null),
    apiClient
      .get<TransactionsPageData>(`/transactions?from=${day}&to=${day}&limit=10`)
      .catch(() => null),
    apiClient.get<Allowance>("/allowance").catch(() => null)
  ]);
  const currency = forecast?.currency ?? budgets?.currency ?? "RUB";
  const money = (value: number) => formatCurrency(value, currency);

  // Виджет — всегда: он на рабочем столе, только если человек его поставил.
  if (allowance) {
    await updateWidget(
      money(Math.max(allowance.leftToday, 0)),
      t("widget.note", {
        date: new Date().toLocaleDateString(locale === "en" ? "en-GB" : "ru-RU", {
          day: "numeric",
          month: "short"
        })
      })
    );
  }

  const payments = Boolean(settings?.paymentReminders);
  const evening = eveningReminderOn();
  if (!payments && !evening) {
    await cancelReminders();
    return;
  }

  let once: Record<string, number> = {};
  try {
    once = JSON.parse(readMine(ONCE_KEY) ?? "{}") as Record<string, number>;
  } catch {
    once = {};
  }
  const items = planReminders({
    now: new Date(),
    payments: payments
      ? (forecast?.upcomingEvents ?? [])
          .filter((event) => event.type === "EXPENSE")
          .map((event) => ({
            id: event.id,
            date: event.date,
            title: event.title,
            amount: event.amount
          }))
      : [],
    budgets: payments
      ? (budgets?.budgets ?? []).map((row) => ({
          categoryId: row.categoryId,
          category: row.category,
          spent: row.spent,
          limit: row.limitAmount
        }))
      : [],
    deposits: payments
      ? (accounts?.accounts ?? []).flatMap((account) =>
          account.depositEndsOn && account.balance > 0
            ? [{ id: account.id, name: account.name, endsOn: account.depositEndsOn }]
            : []
        )
      : [],
    evening,
    loggedToday: (todays?.pagination.total ?? 0) > 0,
    weekly: payments,
    once,
    money,
    t
  });
  if (items.length === 0) {
    await cancelReminders();
    return;
  }
  if (!asked) {
    asked = true;
    await askNotifications();
  }
  await scheduleReminders(items);

  // «Один раз» — запомнить, когда назначено; прошлые месяцы забыть.
  const month = day.slice(0, 7);
  const next: Record<string, number> = {};
  for (const [key, at] of Object.entries(once)) if (key.includes(month)) next[key] = at;
  for (const item of items) if (item.key.startsWith("limit:")) next[item.key] = item.at;
  writeMine(ONCE_KEY, JSON.stringify(next));
}

export function PhoneReminders() {
  useEffect(() => {
    if (!isAndroidShell()) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const soon = (delay: number) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void refreshPhoneReminders().catch(() => undefined), delay);
    };
    soon(1500);
    const stop = onDataChanged(() => soon(3000));
    const back = () => {
      if (document.visibilityState === "visible") soon(1000);
    };
    document.addEventListener("visibilitychange", back);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", back);
      if (timer) clearTimeout(timer);
    };
  }, []);
  return null;
}
