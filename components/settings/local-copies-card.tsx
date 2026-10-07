"use client";

// «Копии на этом устройстве»: главное устройство и синхронизируется, и каждый
// день само откладывает у себя копию всех данных. Если синхронизация однажды
// привезёт не то, вернуть можно отсюда — без службы и других устройств.

import { HardDriveDownload, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useApiPageData } from "@/hooks/use-api-page-data";
import { LOCAL_COPIES_KEEP, type LocalCopy } from "@/lib/api/LocalApiClient";
import { apiClient } from "@/lib/api/client";
import { isMainDevice } from "@/lib/backup/local-copies";
import { useI18n } from "@/lib/i18n/context";

export function LocalCopiesCard() {
  const { t, locale } = useI18n();
  const confirm = useConfirm();
  const { data: copies, reload } = useApiPageData([], "/backup/local-copies");
  const [main, setMain] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void isMainDevice()
      .then(setMain)
      .catch(() => setMain(false));
  }, []);

  const when = (iso: string) =>
    new Date(iso).toLocaleString(locale === "en" ? "en-GB" : "ru-RU", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit"
    });
  const reason = (copy: LocalCopy) =>
    t(
      copy.reason === "daily"
        ? "set.localCopies.daily"
        : copy.reason === "manual"
          ? "set.localCopies.manual"
          : "set.localCopies.beforeRestore"
    );

  async function take() {
    setBusy(true);
    try {
      await apiClient.post("/backup/local-copies", { action: "take" });
      toast.success(t("set.localCopies.taken"));
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function restore(copy: LocalCopy) {
    const ok = await confirm({
      title: t("set.localCopies.confirm", { when: when(copy.savedAt) }),
      description: t("set.localCopies.confirmHint"),
      confirmLabel: t("set.localCopies.restore")
    });
    if (!ok) return;
    setBusy(true);
    try {
      await apiClient.post("/backup/local-copies", { action: "restore", id: copy.id });
      toast.success(t("set.localCopies.restored"));
      await new Promise((resolve) => setTimeout(resolve, 400));
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 px-4 py-4 sm:px-5" data-testid="local-copies">
      <p className="text-sm text-muted-foreground">
        {main === false
          ? t("set.localCopies.other")
          : t("set.localCopies.main", { keep: LOCAL_COPIES_KEEP })}
      </p>
      {copies.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("set.localCopies.none")}</p>
      ) : (
        <ul className="divide-y rounded-lg border text-sm">
          {copies.map((copy) => (
            <li
              key={copy.id}
              className="flex items-center justify-between gap-2 px-3 py-2"
              data-testid="local-copy"
            >
              <span className="min-w-0">
                <span className="block font-medium tabular-nums">{when(copy.savedAt)}</span>
                <span className="text-xs text-muted-foreground">
                  {reason(copy)} · {t("set.localCopies.ops", { count: copy.operations })}
                </span>
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void restore(copy)}
              >
                <Undo2 className="size-4" />
                {t("set.localCopies.restore")}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Button type="button" variant="outline" disabled={busy} onClick={() => void take()}>
        <HardDriveDownload className="size-4" />
        {t("set.localCopies.take")}
      </Button>
    </div>
  );
}
