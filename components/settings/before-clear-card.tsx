"use client";

// «Вернуть» после «Очистить все данные» — неделю.
//
// Очистку нажимают и по ошибке, а файл резервной копии делают не все. Перед
// очисткой приложение откладывает копию на этом устройстве; пока она жива,
// здесь видно, когда очищали, до какого числа можно вернуть, и кнопка.

import { Undo2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useApiPageData } from "@/hooks/use-api-page-data";
import type { BeforeClearCopy } from "@/lib/api/LocalApiClient";
import { apiClient } from "@/lib/api/client";
import { formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";

export function BeforeClearCard() {
  const { t } = useI18n();
  const { data: copy } = useApiPageData<BeforeClearCopy | null>(null, "/backup/before-clear");
  const [busy, setBusy] = useState(false);

  if (!copy) return null;

  async function restore() {
    setBusy(true);
    try {
      await apiClient.post("/backup/before-clear", {});
      toast.success(t("set.beforeClear.done"));
      await new Promise((resolve) => setTimeout(resolve, 400));
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
      setBusy(false);
    }
  }

  return (
    <div
      className="flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 sm:flex-row sm:items-center"
      data-testid="before-clear"
    >
      <p className="flex-1 text-sm">
        {t("set.beforeClear.text", {
          when: formatDate(copy.savedAt),
          until: formatDate(copy.until)
        })}
      </p>
      <Button type="button" size="sm" disabled={busy} onClick={() => void restore()}>
        <Undo2 className="size-4" />
        {t("set.beforeClear.restore")}
      </Button>
    </div>
  );
}
