"use client";

// Состояние связи и спорные записи.
//
// Показывается ТОЛЬКО когда есть что показывать: синхронизация включена или
// спорные записи ждут решения. У человека без сервера — а это все, пока не
// написана служба, — в углу не появляется ничего. Значок, который всегда горит
// серым «не подключено», через неделю перестают замечать, и вместе с ним
// перестают замечать красный.

import { CloudAlert, CloudOff, RefreshCw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { useFamilyMembers } from "@/components/family/family-fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { useApiPageData } from "@/hooks/use-api-page-data";
import { apiClient } from "@/lib/api/client";
import type { ImportPageData } from "@/lib/data";
import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import type { SyncStatus } from "@/lib/storage/SyncingStorageAdapter";
import { describeValue, diffConflict, fieldLabel } from "@/lib/sync/conflict-diff";
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
  const key = `sync.collection.${collection}`;
  const word = t(key);
  return word === key ? t("sync.collection.other") : word;
}

/** Короткое описание строки: то, по чему её узнают на экране. */
function describe(row: Record<string, unknown> | null): string | null {
  if (!row) return null;
  for (const field of [
    "description",
    "name",
    "title",
    "label",
    "note",
    "match",
    "month",
    "input"
  ]) {
    const value = row[field];
    if (typeof value === "string" && value.trim()) return value;
  }
  // Месяц таблицы — это один номер «2026-09» (у листа — «лист|2026-09»).
  const id = typeof row.id === "string" ? row.id.slice(row.id.indexOf("|") + 1) : "";
  return /^\d{4}-\d{2}$/.test(id) ? id : null;
}

/**
 * Две версии одной записи бок о бок: что не сходится — сверху и подсвечено,
 * совпадающее — свёрнуто. Выбирают версию целиком, поэтому кнопок две, по одной
 * на столбец.
 */
function Comparison({
  conflict,
  busy,
  onKeep
}: {
  conflict: StoredConflict;
  busy: boolean;
  onKeep: (side: "mine" | "theirs") => void;
}) {
  const { t } = useI18n();
  const fields = diffConflict(conflict.mine, conflict.theirs);
  const differing = fields.filter((item) => item.differs);
  const same = fields.filter((item) => !item.differs);
  const currency = (row: Record<string, unknown> | null) =>
    typeof row?.currency === "string" ? row.currency : "RUB";
  const members = useFamilyMembers();
  const { data: refs } = useApiPageData<ImportPageData | null>(null, "/import");
  // Ссылки — названиями, а не номерами: «Карта», а не acc-3f2…
  const nameOf = (field: string, value: string): string | null => {
    if (field === "memberId") return members.find((member) => member.id === value)?.name ?? null;
    if (field === "accountId" || field === "linkedAccountId")
      return refs?.accounts?.find((account) => account.id === value)?.name ?? null;
    if (field === "categoryId")
      return refs?.categories?.find((category) => category.id === value)?.label ?? null;
    return null;
  };
  const REFERENCES = ["memberId", "accountId", "linkedAccountId", "categoryId"];
  const show = (field: string, value: unknown, row: Record<string, unknown> | null) =>
    REFERENCES.includes(field) && typeof value === "string"
      ? (nameOf(field, value) ?? "—")
      : describeValue(field, value, t, (amount) => formatCurrency(amount, currency(row)));

  const head = (title: string, current: boolean, row: Record<string, unknown> | null) => (
    <th scope="col" className="px-2 py-2 text-left align-top font-medium">
      <span className="block">{title}</span>
      {current ? (
        <Badge variant="secondary" className="mt-1 font-normal">
          {t("sync.conflicts.current")}
        </Badge>
      ) : null}
      {row ? null : (
        <span className="mt-1 block font-normal text-destructive">
          {t("sync.conflicts.deleted")}
        </span>
      )}
    </th>
  );

  const line = (item: (typeof fields)[number]) => (
    <tr
      key={item.field}
      className={cn("border-t", item.differs && "bg-warning/10")}
      data-differs={item.differs ? "true" : undefined}
    >
      <th scope="row" className="px-2 py-1.5 text-left align-top font-normal text-muted-foreground">
        {fieldLabel(item.field, t)}
      </th>
      {(["here", "there"] as const).map((side) => {
        const row = side === "here" ? conflict.mine : conflict.theirs;
        return (
          <td
            key={side}
            className={cn(
              "px-2 py-1.5 align-top tabular-nums [overflow-wrap:anywhere]",
              item.differs && "font-semibold"
            )}
          >
            {row ? show(item.field, item[side], row) : "—"}
          </td>
        );
      })}
    </tr>
  );

  return (
    <div className="space-y-2" data-testid="conflict-compare">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[18rem] text-xs">
          <thead className="bg-muted/40">
            <tr>
              <th
                scope="col"
                className="w-1/4 px-2 py-2 text-left align-top font-medium text-muted-foreground"
              >
                {t("sync.conflicts.field")}
              </th>
              {head(t("sync.conflicts.here"), conflict.chosen === "mine", conflict.mine)}
              {head(t("sync.conflicts.there"), conflict.chosen === "theirs", conflict.theirs)}
            </tr>
          </thead>
          <tbody>{differing.map(line)}</tbody>
          {same.length > 0 ? (
            <tbody>
              <tr className="border-t">
                <td colSpan={3} className="px-2 py-0">
                  <details className="group">
                    <summary className="cursor-pointer py-1.5 text-muted-foreground">
                      {t("sync.conflicts.same", { count: same.length })}
                    </summary>
                    <table className="mb-1 w-full">
                      <tbody>{same.map(line)}</tbody>
                    </table>
                  </details>
                </td>
              </tr>
            </tbody>
          ) : null}
        </table>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(["mine", "theirs"] as const).map((side) => (
          <Button
            key={side}
            type="button"
            size="sm"
            variant={conflict.chosen === side ? "secondary" : "default"}
            onClick={() => onKeep(side)}
            disabled={busy}
            className="h-auto w-full whitespace-normal py-2"
          >
            {t(side === "mine" ? "sync.conflicts.keepHere" : "sync.conflicts.keepThere")}
          </Button>
        ))}
      </div>
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
          className="relative border border-border md:border-0"
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

        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Состояние связи — заголовок окна уже говорит о спорах. */}
          <p className="text-sm text-muted-foreground">
            {t(`sync.status.${status === "off" ? "offline" : status}`)}
          </p>
          <div className="flex flex-wrap gap-2">
            {status !== "off" ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={status === "sending"}
                data-testid="sync-now"
                onClick={() => void syncStorage.catchUp()}
              >
                <RefreshCw className={cn("size-4", status === "sending" && "animate-spin")} />
                {t("sync.status.now")}
              </Button>
            ) : null}
            <Button asChild size="sm" variant="outline">
              <Link href="/settings?section=sync">{t("sync.status.settings")}</Link>
            </Button>
          </div>
        </div>

        {conflicts.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("sync.conflicts.empty")}</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{t("sync.conflicts.lead")}</p>
            <ul className="flex flex-col gap-4">
              {conflicts.map((conflict) => (
                <li key={`${conflict.slot}/${conflict.collection}/${conflict.key}`}>
                  <p className="mb-1 text-sm font-medium">
                    {collectionLabel(conflict.collection, t)}
                    {describe(conflict.mine ?? conflict.theirs)
                      ? ` — ${describe(conflict.mine ?? conflict.theirs)}`
                      : ""}
                  </p>
                  <p className="mb-2 text-xs text-muted-foreground">
                    {t("sync.conflicts.differs", {
                      count: diffConflict(conflict.mine, conflict.theirs).filter(
                        (item) => item.differs
                      ).length
                    })}
                  </p>
                  <Comparison
                    conflict={conflict}
                    busy={busy}
                    onKeep={(side) => void keep(conflict, side)}
                  />
                </li>
              ))}
            </ul>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
