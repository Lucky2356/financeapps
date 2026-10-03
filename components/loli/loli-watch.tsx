"use client";

// Лоли на этом телефоне: забрать присланные траты и оставить ей сводку.
//
// Траты — при запуске, при каждом возвращении на экран и раз в полминуты, пока
// приложение открыто: сказали Лоли «потратила 850» при открытом учёте — трата
// появляется, не дожидаясь перезапуска. Сводка — после каждого изменения в
// учёте (с задержкой: пачка правок — одно обновление).
//
// В примере («Пример» — выдуманный учёт) ничего не принимается и не отдаётся:
// настоящие траты не должны смешаться с выдуманными, а выдуманные цифры — уйти
// в ответы Лоли. Присланное ждёт в очереди телефона, пока не вернутся к своим.

import { useEffect } from "react";
import { toast } from "sonner";

import { PAYDAY_KEY } from "@/components/dashboard/payday-card";
import { deviceMember } from "@/components/family/family-fields";
import { apiClient } from "@/lib/api/client";
import { onDataChanged } from "@/lib/api/data-events";
import type { Allowance } from "@/lib/analytics/daily-allowance";
import type { MonthRecap } from "@/lib/analytics/month-recap";
import type { PaydayForecast } from "@/lib/analytics/payday";
import { BANK_EVENT } from "@/lib/bank/suggestions";
import type { AccountsPageData, BudgetsPageData } from "@/lib/data";
import { formatCurrency } from "@/lib/format";
import { translate } from "@/lib/i18n/catalog";
import { getClientLocale } from "@/lib/i18n/client-locale";
import { applyLoliItems } from "@/lib/loli/apply";
import { parseLoliQueue } from "@/lib/loli/inbox";
import { buildLoliSummary } from "@/lib/loli/summary";
import {
  ackLoliQueue,
  loliStatus,
  publishLoliSummary,
  takeLoliQueue
} from "@/lib/platform/android-loli";
import { isAndroidShell } from "@/lib/platform/device";
import { LAST_ACCOUNT_KEY, readMine, writeMine } from "@/lib/storage/mine";
import { SAMPLE_PROFILE_ID, type ProfileList } from "@/types/profiles";

async function inSample(): Promise<boolean> {
  try {
    const list = await apiClient.get<ProfileList>("/profiles");
    return list.activeProfileId === SAMPLE_PROFILE_ID;
  } catch {
    return true; // не знаем, чей учёт открыт, — лучше подождать
  }
}

let busy = false;

async function takeFromLoli() {
  if (busy) return;
  busy = true;
  try {
    const status = await loliStatus();
    if (!status?.enabled || !status.trusted) return;
    if (await inSample()) return;
    const items = parseLoliQueue(await takeLoliQueue());
    if (items.length === 0) return;
    const outcome = await applyLoliItems(items, {
      api: apiClient,
      read: readMine,
      write: writeMine,
      auto: status.auto,
      lastAccount: readMine(LAST_ACCOUNT_KEY),
      member: (type) => deviceMember(type) as Record<string, string>,
      now: Date.now()
    });
    await ackLoliQueue(items.map((item) => ({ id: item.id, at: item.at })));
    window.dispatchEvent(new Event(BANK_EVENT));
    const locale = getClientLocale();
    for (const one of outcome.recorded) {
      toast.success(
        translate(locale, "loli.recorded", {
          amount: formatCurrency(one.amount, one.currency),
          category: one.category
        })
      );
    }
    if (outcome.suggested > 0) {
      toast.message(translate(locale, "loli.suggested", { count: outcome.suggested }));
    }
  } catch {
    // Учёт заперт или занят. Очередь телефона подтверждается только после
    // разбора — присланное дождётся следующего захода.
  } finally {
    busy = false;
  }
}

async function shareWithLoli() {
  const status = await loliStatus();
  if (!status?.enabled || !status.share) return;
  if (await inSample()) return;
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const manual = readMine(PAYDAY_KEY);
  const [allowance, recap, budgets, accounts, payday] = await Promise.all([
    apiClient.get<Allowance>("/allowance").catch(() => null),
    apiClient.get<MonthRecap>(`/month-recap?month=${month}`).catch(() => null),
    apiClient.get<BudgetsPageData>(`/budgets?month=${month}`).catch(() => null),
    apiClient.get<AccountsPageData>("/accounts").catch(() => null),
    apiClient
      .get<{ forecast: PaydayForecast | null }>(`/payday${manual ? `?day=${manual}` : ""}`)
      .catch(() => null)
  ]);
  const summary = buildLoliSummary({
    now,
    currency: accounts?.currency ?? budgets?.currency ?? "RUB",
    allowance,
    recap,
    budgets: budgets?.budgets ?? [],
    accounts: accounts?.accounts ?? [],
    totalBalance: accounts?.totalBalance ?? 0,
    payday: payday?.forecast ?? null
  });
  await publishLoliSummary(JSON.stringify(summary));
}

export function LoliWatch() {
  useEffect(() => {
    if (!isAndroidShell()) return;
    let timer: number | undefined;
    const share = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void shareWithLoli().catch(() => undefined), 2000);
    };
    void takeFromLoli();
    share();
    const visible = () => {
      if (document.visibilityState === "visible") {
        void takeFromLoli();
        share();
      }
    };
    const every = window.setInterval(() => {
      if (document.visibilityState === "visible") void takeFromLoli();
    }, 30_000);
    document.addEventListener("visibilitychange", visible);
    const stop = onDataChanged(share);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(every);
      document.removeEventListener("visibilitychange", visible);
      stop();
    };
  }, []);
  return null;
}
