"use client";

// «Корзина»: удалённое за 30 дней — здесь или на другом устройстве (lib/trash).
//
// Удаления показываются СОБЫТИЯМИ, а не строками: «12:30 · пришло с другого
// устройства · 48 записей» — это одно нажатие кого-то на телефоне, и вернуть его
// надо одним нажатием здесь. Внутри события — сами записи, каждую можно вернуть
// отдельно.

import { ChevronDown, Trash2, Undo2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useApiPageData } from "@/hooks/use-api-page-data";
import { apiClient } from "@/lib/api/client";
import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

type Entry = {
  id: string;
  collection: string;
  title: string;
  amount: number | null;
  currency: string;
  type: string | null;
  date: string | null;
  deletedAt: string;
  origin: "here" | "elsewhere";
};

type Group = { key: string; deletedAt: string; origin: Entry["origin"]; entries: Entry[] };

/** Одно удаление — одно событие: то, что исчезло в одну секунду и из одного места. */
export function groupTrash(entries: Entry[]): Group[] {
  const groups = new Map<string, Group>();
  for (const entry of entries) {
    const key = `${entry.deletedAt.slice(0, 19)}|${entry.origin}`;
    const group = groups.get(key) ?? {
      key,
      deletedAt: entry.deletedAt,
      origin: entry.origin,
      entries: []
    };
    group.entries.push(entry);
    groups.set(key, group);
  }
  return Array.from(groups.values()).sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

export function TrashCard() {
  const { t, locale } = useI18n();
  const confirm = useConfirm();
  const { data, reload } = useApiPageData({ entries: [] }, "/trash");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const groups = useMemo(() => groupTrash(data.entries), [data.entries]);

  const when = (iso: string) =>
    new Date(iso).toLocaleString(locale === "en" ? "en-GB" : "ru-RU", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit"
    });
  const what = (entry: Entry) => {
    const kind = t(`trash.kind.${entry.collection}`);
    const name = entry.title || kind;
    const money =
      entry.amount !== null
        ? ` · ${entry.type === "INCOME" ? "+" : entry.type === "EXPENSE" ? "−" : ""}${formatCurrency(entry.amount, entry.currency)}`
        : "";
    return { kind, line: `${name}${money}` };
  };

  async function restore(ids: string[]) {
    setBusy(true);
    try {
      const result = await apiClient.post("/trash", {
        action: "restore",
        ids
      });
      if (result.restored > 0) toast.success(t("trash.restored", { count: result.restored }));
      for (const reason of new Set(result.failed)) toast.error(reason);
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function empty() {
    const ok = await confirm({
      title: t("trash.emptyConfirm"),
      description: t("trash.emptyHint"),
      confirmLabel: t("trash.empty"),
      destructive: true
    });
    if (!ok) return;
    setBusy(true);
    try {
      await apiClient.post("/trash", { action: "empty" });
      await reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 px-4 py-4 sm:px-5" data-testid="trash">
      <p className="text-sm text-muted-foreground">{t("trash.lead")}</p>
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("trash.none")}</p>
      ) : (
        <ul className="divide-y rounded-lg border text-sm">
          {groups.map((group) => {
            const expanded = open === group.key;
            const first = what(group.entries[0]);
            return (
              <li key={group.key} data-testid="trash-group">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 basis-48 items-start gap-2 text-left"
                    aria-expanded={expanded}
                    onClick={() => setOpen(expanded ? null : group.key)}
                  >
                    <ChevronDown
                      className={cn(
                        "mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform",
                        expanded && "rotate-180"
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0">
                      <span className="block font-medium [overflow-wrap:anywhere]">
                        {group.entries.length === 1
                          ? first.line
                          : t("trash.many", { count: group.entries.length })}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {when(group.deletedAt)} ·{" "}
                        {t(group.origin === "here" ? "trash.here" : "trash.elsewhere")}
                        {group.entries.length === 1 ? ` · ${first.kind}` : ""}
                      </span>
                    </span>
                  </button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="ml-auto shrink-0"
                    disabled={busy}
                    onClick={() => void restore(group.entries.map((entry) => entry.id))}
                  >
                    <Undo2 className="size-4" />
                    {group.entries.length === 1 ? t("trash.restore") : t("trash.restoreAll")}
                  </Button>
                </div>
                {expanded && group.entries.length > 1 ? (
                  <ul className="border-t bg-muted/30">
                    {group.entries.map((entry) => {
                      const item = what(entry);
                      return (
                        <li
                          key={entry.id}
                          className="flex items-center justify-between gap-2 px-3 py-1.5 pl-9"
                          data-testid="trash-entry"
                        >
                          <span className="min-w-0 [overflow-wrap:anywhere]">
                            {item.line}
                            <span className="block text-xs text-muted-foreground">{item.kind}</span>
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="shrink-0"
                            disabled={busy}
                            onClick={() => void restore([entry.id])}
                          >
                            {t("trash.restore")}
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {groups.length > 0 ? (
        <Button type="button" variant="outline" disabled={busy} onClick={() => void empty()}>
          <Trash2 className="size-4" />
          {t("trash.empty")}
        </Button>
      ) : null}
    </div>
  );
}
