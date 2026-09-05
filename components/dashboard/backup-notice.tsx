"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { apiClient } from "@/lib/api/client";
import type { ImportPageData } from "@/lib/data";
import { useI18n } from "@/lib/i18n/context";

/**
 * The line that says the only copy of the ledger is the one on this machine.
 *
 * Автобэкап по умолчанию выключен, и до 1.25.0 единственным, что говорило
 * человеку о несвежей копии, был пункт в «Быстром старте». Тот блок закрывается
 * крестиком, флаг ложится в localStorage — один клик, и предупреждение не
 * возвращалось уже никогда. Человек мог полгода вести учёт, ни разу не сделав
 * копию, и узнать об этом только когда данных уже нет.
 *
 * Поэтому здесь отдельная строка, а не пункт списка: у неё нет крестика, и
 * убирается она единственным способом — сделать копию. Настроенный автобэкап
 * обновляет `lastBackupAt` сам, так что для того, кто один раз выбрал папку,
 * строка не появится вовсе.
 *
 * Показывается только когда есть что терять: на пустой установке молчит.
 *
 * Ссылка ведёт на «Настройки → Данные», а не на /import: экран импорта переехал
 * туда, а /import остался клиентским редиректом для старых закладок. Отправлять
 * человека через редирект незачем.
 */
export function BackupNotice() {
  const { t, locale } = useI18n();
  const [refs, setRefs] = useState<ImportPageData | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const data = await apiClient.get<ImportPageData>("/import").catch(() => null);
      if (!cancelled) setRefs(data);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!refs || !refs.backupReminderDue || refs.accounts.length === 0) return null;

  const since = refs.lastBackupAt
    ? new Date(refs.lastBackupAt).toLocaleDateString(locale === "en" ? "en-US" : "ru-RU", {
        day: "numeric",
        month: "long",
        year: "numeric"
      })
    : null;

  return (
    <p
      data-testid="backup-notice"
      className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm"
    >
      <span>{since ? t("backup.notice.stale", { date: since }) : t("backup.notice.never")}</span>
      <Link
        href="/settings?section=data"
        className="font-medium text-primary underline underline-offset-4"
        data-testid="backup-notice-link"
      >
        {t("backup.notice.cta")}
      </Link>
    </p>
  );
}
