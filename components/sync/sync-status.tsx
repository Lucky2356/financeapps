"use client";

// Состояние связи и спорные записи.
//
// Показывается ТОЛЬКО когда есть что показывать: синхронизация включена или
// спорные записи ждут решения. У человека без сервера — а это все, пока не
// написана служба, — в углу не появляется ничего. Значок, который всегда горит
// серым «не подключено», через неделю перестают замечать, и вместе с ним
// перестают замечать красный.

import { CloudAlert, CloudOff, RefreshCw, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { apiClient } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n/context";
import type { SyncStatus } from "@/lib/storage/SyncingStorageAdapter";
import type { StoredConflict } from "@/lib/vault/conflicts";
import { conflictStore, syncStorage } from "@/lib/vault/runtime";
import { cn } from "@/lib/utils";

const ICONS: Record<Exclude<SyncStatus, "off">, typeof CloudOff> = {
  synced: RefreshCw,
  sending: RefreshCw,
  offline: CloudOff,
  error: CloudAlert
};

/** Название раздела человеческим словом, а не именем поля из книги. */
function collectionLabel(collection: string, t: (key: string) => string): string {
  const known = [
    "accounts",
    "categories",
    "transactions",
    "budgets",
    "goals",
    "liabilities",
    "plans",
    "planNotes"
  ];
  return t(known.includes(collection) ? `sync.collection.${collection}` : "sync.collection.other");
}

/** Короткое описание строки: то, по чему её узнают на экране. */
function describe(row: Record<string, unknown> | null): string | null {
  if (!row) return null;
  for (const field of ["description", "name", "label", "note", "month"]) {
    const value = row[field];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function Version({
  title,
  row,
  current,
  onKeep,
  busy
}: {
  title: string;
  row: Record<string, unknown> | null;
  current: boolean;
  onKeep: () => void;
  busy: boolean;
}) {
  const { t } = useI18n();
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border p-3",
        current && "border-primary/60 bg-primary/5"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>
        {current ? <Badge variant="secondary">{t("sync.conflicts.current")}</Badge> : null}
      </div>

      {row ? (
        // Строка целиком, как она есть. Показывать «изменилось поле amount» было
        // бы удобнее и опаснее: выбирают не поле, а версию записи, и человек
        // должен видеть то, что выбирает.
        <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-xs">
          {Object.entries(row)
            .filter(([field]) => field !== "updatedAt" && field !== "id")
            .map(([field, value]) => (
              <div key={field} className="contents">
                <dt className="truncate text-muted-foreground">{field}</dt>
                <dd className="text-right font-medium tabular-nums">{String(value)}</dd>
              </div>
            ))}
        </dl>
      ) : (
        <p className="text-xs font-medium text-destructive">{t("sync.conflicts.deleted")}</p>
      )}

      <Button
        type="button"
        size="sm"
        variant={current ? "secondary" : "default"}
        onClick={onKeep}
        disabled={busy}
        className="h-auto w-full whitespace-normal py-2"
      >
        {t("sync.conflicts.keep")}
      </Button>
    </div>
  );
}

export function SyncStatusIndicator() {
  const { t } = useI18n();
  const [status, setStatus] = useState<SyncStatus>(syncStorage.status);
  const [conflicts, setConflicts] = useState<StoredConflict[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    const offStatus = syncStorage.onStatus(setStatus);
    const offConflicts = conflictStore.onChange(setConflicts);

    void (async () => {
      const list = await conflictStore.list();
      if (!alive) return;
      setStatus(syncStorage.status);
      setConflicts(list);
    })();

    return () => {
      alive = false;
      offStatus();
      offConflicts();
    };
  }, []);

  async function keep(conflict: StoredConflict, side: "mine" | "theirs") {
    setBusy(true);
    try {
      await apiClient.post("/sync/resolve", {
        collection: conflict.collection,
        key: conflict.key,
        row: side === "mine" ? conflict.mine : conflict.theirs
      });
      await conflictStore.resolve(conflict);
    } finally {
      setBusy(false);
    }
  }

  // Ни связи, ни споров — и показывать нечего.
  if (status === "off" && conflicts.length === 0) return null;

  const Icon = conflicts.length > 0 ? TriangleAlert : ICONS[status as Exclude<SyncStatus, "off">];
  const label =
    conflicts.length > 0
      ? t("sync.conflicts.title")
      : t(`sync.status.${status === "off" ? "offline" : status}`);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          title={label}
          className="relative"
        >
          <Icon
            className={cn(
              "size-4",
              status === "sending" && "animate-spin",
              status === "error" && "text-destructive",
              conflicts.length > 0 && "text-destructive"
            )}
          />
          {conflicts.length > 0 ? (
            <span className="absolute right-1 top-1 size-2 rounded-full bg-destructive" />
          ) : null}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("sync.conflicts.title")}</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">{label}</p>

        {conflicts.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("sync.conflicts.empty")}</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{t("sync.conflicts.lead")}</p>
            <ul className="flex flex-col gap-4">
              {conflicts.map((conflict) => (
                <li key={`${conflict.slot}/${conflict.collection}/${conflict.key}`}>
                  <p className="mb-2 text-sm font-medium">
                    {collectionLabel(conflict.collection, t)}
                    {describe(conflict.mine ?? conflict.theirs)
                      ? ` — ${describe(conflict.mine ?? conflict.theirs)}`
                      : ""}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Version
                      title={t("sync.conflicts.here")}
                      row={conflict.mine}
                      current={conflict.chosen === "mine"}
                      busy={busy}
                      onKeep={() => void keep(conflict, "mine")}
                    />
                    <Version
                      title={t("sync.conflicts.there")}
                      row={conflict.theirs}
                      current={conflict.chosen === "theirs"}
                      busy={busy}
                      onKeep={() => void keep(conflict, "theirs")}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
