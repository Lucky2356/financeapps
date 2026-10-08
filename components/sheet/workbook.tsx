"use client";

// Книга таблиц: вкладки листов над таблицей, как ярлыки листов в Excel.
//
// Выбранный лист — в адресе (`?sheet=`): ссылка открывает тот же лист, «назад»
// возвращает к прошлому. Таблица каждого листа монтируется заново (key), чтобы
// выделенная клетка, отмена и прочее состояние одного листа не переезжали на
// другой.

import { ChevronLeft, ChevronRight, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { BudgetSheet } from "@/components/sheet/budget-sheet";
import { FreeSheet } from "@/components/sheet/free-sheet";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import { useApiPageData } from "@/hooks/use-api-page-data";
import { apiClient } from "@/lib/api/client";
import type { SheetTab, WorkbookPage } from "@/lib/api/local/sheets";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

const EMPTY: WorkbookPage = {
  sheets: [{ id: "main", name: "", kind: "budget" }],
  sheet: { id: "main", name: "", kind: "budget" },
  budget: null,
  free: null
};

export function Workbook() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const wanted = params.get("sheet");
  const { data, reload } = useApiPageData(
    EMPTY,
    wanted ? `/workbook?sheet=${encodeURIComponent(wanted)}` : "/workbook"
  );
  const confirm = useConfirm();
  const [dialog, setDialog] = useState<
    | { mode: "create"; name: string; kind: "budget" | "free" }
    | { mode: "rename"; id: string; name: string }
    | null
  >(null);

  const current = data.sheet;

  // Перенос всего файла Excel заводит листы из глубины таблицы — вкладкам надо
  // узнать об этом и перечитать себя.
  useEffect(() => {
    const onChange = () => void reload();
    window.addEventListener("workbook-changed", onChange);
    return () => window.removeEventListener("workbook-changed", onChange);
  }, [reload]);

  function open(id: string) {
    const next = new URLSearchParams(params.toString());
    if (id === "main") next.delete("sheet");
    else next.set("sheet", id);
    const query = next.toString();
    router.push(`/sheet${query ? `?${query}` : ""}`);
  }

  async function save() {
    if (!dialog) return;
    try {
      if (dialog.mode === "create") {
        const tab = await apiClient.post("/sheets", {
          action: "create",
          name: dialog.name,
          kind: dialog.kind
        });
        setDialog(null);
        await reload();
        open(tab.id);
      } else {
        await apiClient.post("/sheets", { action: "rename", id: dialog.id, name: dialog.name });
        setDialog(null);
        await reload();
      }
    } catch (cause) {
      toast.error((cause as Error).message);
    }
  }

  async function move(id: string, direction: -1 | 1) {
    await apiClient.post("/sheets", { action: "move", id, direction });
    await reload();
  }

  async function remove(tab: SheetTab) {
    const ok = await confirm({
      title: t("wb.removeConfirm", { name: tab.name }),
      description: t("wb.removeHint"),
      confirmLabel: t("wb.remove"),
      destructive: true
    });
    if (!ok) return;
    try {
      await apiClient.post("/sheets", { action: "remove", id: tab.id });
      await reload();
      open("main");
    } catch (cause) {
      toast.error((cause as Error).message);
    }
  }

  return (
    <div className="space-y-3">
      <div
        className="flex items-center gap-1 overflow-x-auto rounded-lg border bg-muted/40 p-1"
        role="tablist"
        aria-label={t("wb.tabs")}
        data-testid="sheet-tabs"
      >
        {data.sheets.map((tab) => {
          const active = tab.id === current.id;
          return (
            <div key={tab.id} className="flex shrink-0 items-center">
              <button
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => open(tab.id)}
                className={cn(
                  "flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-sm transition-colors",
                  active
                    ? "bg-card font-semibold text-foreground shadow-sm ring-1 ring-border"
                    : "text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
                )}
                data-testid="sheet-tab"
              >
                {tab.name || t("wb.main")}
                {tab.kind === "free" ? (
                  <span className="rounded bg-foreground/10 px-1 text-[10px] font-normal">
                    {t("wb.freeBadge")}
                  </span>
                ) : null}
              </button>
              {active ? (
                <button
                  type="button"
                  className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
                  aria-label={t("wb.menu", { name: tab.name || t("wb.main") })}
                  onClick={() =>
                    setDialog({ mode: "rename", id: tab.id, name: tab.name || t("wb.main") })
                  }
                  data-testid="sheet-tab-menu"
                >
                  <MoreHorizontal className="size-4" />
                </button>
              ) : null}
            </div>
          );
        })}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="ml-1 shrink-0 text-foreground hover:bg-foreground/[0.07]"
          onClick={() => setDialog({ mode: "create", name: "", kind: "budget" })}
          data-testid="sheet-add"
        >
          <Plus className="size-4" />
          {t("wb.add")}
        </Button>
      </div>

      {current.kind === "free" ? (
        <FreeSheet key={current.id} sheetId={current.id} onChanged={reload} />
      ) : (
        <BudgetSheet key={current.id} sheetId={current.id} />
      )}

      <Dialog open={dialog !== null} onOpenChange={(value) => (value ? null : setDialog(null))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {dialog?.mode === "rename" ? t("wb.manageTitle") : t("wb.addTitle")}
            </DialogTitle>
            {dialog?.mode === "create" ? (
              <DialogDescription>{t("wb.addLead")}</DialogDescription>
            ) : null}
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="sheet-name">{t("wb.name")}</Label>
              <Input
                id="sheet-name"
                autoFocus
                maxLength={60}
                value={dialog?.name ?? ""}
                onChange={(event) =>
                  setDialog((was) => (was ? { ...was, name: event.target.value } : was))
                }
              />
            </div>
            {dialog?.mode === "create" ? (
              <div className="grid gap-1.5">
                <Label>{t("wb.kind")}</Label>
                <Segmented
                  ariaLabel={t("wb.kind")}
                  value={dialog.kind}
                  options={[
                    { value: "budget", label: t("wb.kindBudget") },
                    { value: "free", label: t("wb.kindFree") }
                  ]}
                  onChange={(kind) =>
                    setDialog((was) => (was && was.mode === "create" ? { ...was, kind } : was))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  {dialog.kind === "budget" ? t("wb.kindBudgetHint") : t("wb.kindFreeHint")}
                </p>
              </div>
            ) : null}
            {dialog?.mode === "rename" ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={data.sheets[0]?.id === dialog.id}
                  onClick={() => void move(dialog.id, -1)}
                >
                  <ChevronLeft className="size-4" />
                  {t("wb.moveLeft")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={data.sheets[data.sheets.length - 1]?.id === dialog.id}
                  onClick={() => void move(dialog.id, 1)}
                >
                  {t("wb.moveRight")}
                  <ChevronRight className="size-4" />
                </Button>
                {dialog.id !== "main" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    className="sm:ml-auto"
                    onClick={() => {
                      const tab = data.sheets.find((item) => item.id === dialog.id);
                      setDialog(null);
                      if (tab) void remove(tab);
                    }}
                  >
                    <Trash2 className="size-4" />
                    {t("wb.remove")}
                  </Button>
                ) : null}
              </div>
            ) : null}
            <DialogFooter>
              <Button type="submit" disabled={!dialog?.name.trim()}>
                {dialog?.mode === "rename" ? t("wb.save") : t("wb.create")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
