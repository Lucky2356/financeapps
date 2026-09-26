"use client";

// На подключаемом устройстве уже есть свои записи.
//
// Подключение приносит ключ и данные другого устройства. Свои записи здесь
// зашифрованы своим ключом, и после подключения открыть их было бы нечем —
// поэтому раньше приложение просто отказывало: «выгрузите копию, очистите
// данные, подключитесь заново». Три похода по настройкам ради одного решения.
//
// Теперь решение спрашивается здесь же: сохранить копию и заменить, заменить
// без копии или передумать. Стирается только ЭТО устройство — данные того, к
// которому подключаемся, и есть то, что сюда приедет.

import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api/client";
import { todayDay } from "@/lib/transactions/date";
import { createFileSystemAdapter } from "@/lib/files/createFileSystemAdapter";
import { useI18n } from "@/lib/i18n/context";
import { forgetMyData } from "@/lib/storage/mine";

export function ReplaceLocal({
  onReplaced,
  onCancel
}: {
  /** Записи стёрты — можно подключаться. */
  onReplaced: () => void;
  onCancel?: () => void;
}) {
  const { t } = useI18n();
  const fileSystem = useMemo(() => createFileSystemAdapter(), []);
  const [busy, setBusy] = useState(false);

  async function replace(withBackup: boolean) {
    setBusy(true);
    try {
      if (withBackup) {
        const backup = await apiClient.get<unknown>("/backup");
        const saved = await fileSystem.saveTextFile(
          `financial-assistant-backup-${todayDay()}.json`,
          JSON.stringify(backup, null, 2),
          "application/json;charset=utf-8"
        );
        // Закрыл окно сохранения — значит, копии нет, и стирать нельзя.
        if (!saved) return;
        toast.success(t("imp.toast.backupSaved"));
      }
      await apiClient.delete("/storage/clear");
      forgetMyData();
      onReplaced();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="space-y-3 rounded-lg border border-warning/40 bg-warning/10 p-4"
      data-testid="replace-local"
    >
      <p className="text-sm font-medium">{t("sync2.replace.title")}</p>
      <p className="text-sm text-muted-foreground">{t("sync2.replace.desc")}</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button type="button" disabled={busy} onClick={() => void replace(true)}>
          {t("sync2.replace.withBackup")}
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => void replace(false)}>
          {t("sync2.replace.without")}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
            {t("common.cancel")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
