"use client";

// Перенос таблицы из Excel.
//
// Два пути, оба без набора руками: вставить скопированное (выделил в Excel,
// Ctrl+C, сюда Ctrl+V) или выбрать файл .xlsx/.csv. Дальше — экран «что где»:
// приложение уже угадало, какой столбец Остаток, какой доходы, какой уходит в
// сбережения и с какой категорией учёта связан каждый расход; поправить можно
// любой. И сверка: Итог, который посчитает таблица, против Итога из Excel.

import { CheckCircle2, FileUp, TriangleAlert } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { monthLabel, useSheetText } from "@/components/sheet/sheet-text";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n/context";
import type { ImportPageData } from "@/lib/data";
import {
  buildPayload,
  checkTotals,
  gridFromCells,
  gridFromText,
  planImport,
  type Grid,
  type ImportColumn,
  type ImportPlan,
  type ImportRole
} from "@/lib/sheet/import";
import { SHEET_COLUMN_KINDS } from "@/lib/sheet/model";

const CREATE = "__create__";
const NONE = "__none__";

export function SheetImportDialog({
  sheetId = "main",
  open,
  onOpenChange,
  categories,
  hasSheet,
  onImported
}: {
  sheetId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: ImportPageData["categories"];
  hasSheet: boolean;
  onImported: () => Promise<void>;
}) {
  const { words, format, locale } = useSheetText();
  const { t } = useI18n();
  const [text, setText] = useState("");
  const [sheets, setSheets] = useState<Array<{ name: string; grid: Grid }>>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refs = useMemo(
    () =>
      categories.map((category) => ({
        id: category.id,
        label: category.label,
        kind: category.kind as "INCOME" | "EXPENSE"
      })),
    [categories]
  );

  function fromGrid(grid: Grid) {
    setPlan(planImport(grid, refs));
  }

  async function onFile(file: File) {
    try {
      if (/\.xlsx$/i.test(file.name)) {
        const { default: readXlsxFile } = await import("read-excel-file/browser");
        const read = await readXlsxFile(file);
        const list = read.map((sheet) => ({
          name: sheet.sheet,
          grid: gridFromCells(sheet.data as unknown[][])
        }));
        setSheets(list);
        setSheetIndex(0);
        if (list[0]) fromGrid(list[0].grid);
      } else {
        const content = await file.text();
        setSheets([]);
        setText(content);
        fromGrid(gridFromText(content));
      }
    } catch (cause) {
      toast.error(format(words.importBadFile, { error: (cause as Error).message }));
    }
  }

  const payload = plan && plan.rows.length > 0 ? buildPayload(plan) : null;

  // Весь файл разом: лист, в котором нашлись месяцы, — бюджет; остальные —
  // свободные листы как есть.
  const wholeBook = useMemo(
    () =>
      sheets.map((sheet) => {
        const found = planImport(sheet.grid, refs);
        return found.rows.length > 0
          ? {
              name: sheet.name,
              kind: "budget" as const,
              months: found.rows.length,
              plan: found,
              grid: sheet.grid,
              rows: 0,
              cols: 0
            }
          : {
              name: sheet.name,
              kind: "free" as const,
              months: 0,
              plan: null,
              grid: sheet.grid,
              rows: sheet.grid.length,
              cols: Math.max(0, ...sheet.grid.map((line) => line.length))
            };
      }),
    [sheets, refs]
  );
  const [skipped, setSkipped] = useState<Set<number>>(new Set());

  async function runWholeBook() {
    setBusy(true);
    try {
      const chosen = wholeBook
        .filter((_, index) => !skipped.has(index))
        .map((item) =>
          item.kind === "budget" && item.plan
            ? { name: item.name, kind: "budget", payload: buildPayload(item.plan) }
            : { name: item.name, kind: "free", grid: item.grid }
        );
      await apiClient.post("/sheets", { action: "importWorkbook", sheets: chosen });
      window.dispatchEvent(new Event("workbook-changed"));
      await onImported();
      toast.success(t("wb.importedAll", { count: chosen.length }));
      onOpenChange(false);
      setPlan(null);
      setSheets([]);
      setSkipped(new Set());
    } catch (cause) {
      toast.error((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const totals = plan && payload ? checkTotals(plan, payload) : null;

  function setColumn(index: number, patch: Partial<ImportColumn>) {
    setPlan((was) =>
      was
        ? {
            ...was,
            columns: was.columns.map((column) =>
              column.index === index ? { ...column, ...patch } : column
            )
          }
        : was
    );
  }

  async function run() {
    if (!payload || !plan) return;
    setBusy(true);
    try {
      await apiClient.post("/sheet", { sheetId, action: "import", payload });
      await onImported();
      toast.success(format(words.imported, { months: plan.rows.length }));
      onOpenChange(false);
      setPlan(null);
      setText("");
      setSheets([]);
    } catch (cause) {
      toast.error((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const roles: ImportRole[] = [...SHEET_COLUMN_KINDS, "total", "skip"];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl" data-testid="sheet-import">
        <DialogHeader>
          <DialogTitle>{words.importTitle}</DialogTitle>
          <DialogDescription>{words.importLead}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <Label htmlFor="sheet-paste">{words.importPaste}</Label>
          <Textarea
            id="sheet-paste"
            rows={4}
            className="font-mono text-xs"
            value={text}
            placeholder="Месяц	Остаток	Доходы	Продукты	…"
            onChange={(event) => {
              setText(event.target.value);
              setSheets([]);
              fromGrid(gridFromText(event.target.value));
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => fileRef.current?.click()}
            >
              <FileUp className="size-4" />
              {words.importFile}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.csv,.tsv,.txt"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void onFile(file);
                event.target.value = "";
              }}
            />
            {sheets.length > 1 ? (
              <Select
                value={String(sheetIndex)}
                onValueChange={(value) => {
                  const index = Number(value);
                  setSheetIndex(index);
                  fromGrid(sheets[index].grid);
                }}
              >
                <SelectTrigger className="w-48" aria-label={words.importSheetPick}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sheets.map((sheet, index) => (
                    <SelectItem key={sheet.name} value={String(index)}>
                      {words.importSheetPick}: {sheet.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>
        </div>

        {sheets.length > 1 ? (
          <div className="space-y-2 rounded-lg border p-3" data-testid="workbook-import">
            <p className="text-sm font-medium">
              {t("wb.importAllTitle", { count: sheets.length })}
            </p>
            <p className="text-xs text-muted-foreground">{t("wb.importAllLead")}</p>
            <ul className="space-y-1 text-sm">
              {wholeBook.map((item, index) => (
                <li key={`${item.name}-${index}`} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="size-4 accent-foreground"
                    checked={!skipped.has(index)}
                    aria-label={item.name}
                    onChange={(event) =>
                      setSkipped((was) => {
                        const next = new Set(was);
                        if (event.target.checked) next.delete(index);
                        else next.add(index);
                        return next;
                      })
                    }
                  />
                  <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{item.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {item.kind === "budget"
                      ? t("wb.importAsBudget", { months: item.months })
                      : t("wb.importAsFree", { rows: item.rows, cols: item.cols })}
                  </span>
                </li>
              ))}
            </ul>
            <Button
              type="button"
              size="sm"
              disabled={busy || wholeBook.length === skipped.size}
              onClick={() => void runWholeBook()}
              data-testid="workbook-import-run"
            >
              {t("wb.importAll", { count: wholeBook.length - skipped.size })}
            </Button>
          </div>
        ) : null}

        {!plan ? (
          <p className="text-sm text-muted-foreground">{words.importNothing}</p>
        ) : (
          <div className="space-y-3">
            {plan.warnings.map((warning) => (
              <p key={warning} className="text-sm text-warning">
                {warning}
              </p>
            ))}
            {plan.rows.length > 0 ? (
              <p className="text-sm" data-testid="sheet-import-found">
                {format(words.importFound, {
                  months: plan.rows.length,
                  from: monthLabel(plan.rows[0].month, locale),
                  to: monthLabel(plan.rows[plan.rows.length - 1].month, locale),
                  columns: plan.columns.filter((column) => column.role !== "month").length
                })}
              </p>
            ) : null}
            {plan.markers.length > 0 ? (
              <p className="text-sm text-muted-foreground">
                {format(words.importMarkers, {
                  items: plan.markers
                    .map(
                      (marker) =>
                        `${marker.label} ${marker.date.split("-").reverse().join(".")} — ${marker.amount.toLocaleString("ru-RU")}`
                    )
                    .join("; ")
                })}
              </p>
            ) : null}
            {totals && totals.checked > 0 ? (
              totals.mismatched.length === 0 ? (
                <p
                  className="flex items-start gap-2 text-sm text-success"
                  data-testid="sheet-import-ok"
                >
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                  {format(words.importTotalsOk, { count: totals.checked })}
                </p>
              ) : (
                <p className="flex items-start gap-2 text-sm text-warning">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                  {format(words.importTotalsBad, {
                    count: totals.mismatched.length,
                    month: monthLabel(totals.mismatched[0].month, locale),
                    file: totals.mismatched[0].file.toLocaleString("ru-RU"),
                    ours: totals.mismatched[0].ours.toLocaleString("ru-RU")
                  })}
                </p>
              )
            ) : null}

            <div className="max-h-[40svh] overflow-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted text-xs">
                  <tr>
                    <th className="px-2 py-1.5 text-left">{words.importColumns}</th>
                    <th className="px-2 py-1.5 text-left">{words.importRole}</th>
                    <th className="px-2 py-1.5 text-left">{words.columnCategory}</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.columns
                    .filter((column) => column.role !== "month")
                    .map((column) => {
                      const categoryKind =
                        column.role === "income"
                          ? "INCOME"
                          : column.role === "expense"
                            ? "EXPENSE"
                            : null;
                      const value = column.categoryId ?? (column.createCategory ? CREATE : NONE);
                      return (
                        <tr key={column.index} className="border-t">
                          <td className="px-2 py-1.5">
                            <span className="font-medium">{column.name}</span>
                            <span className="block text-xs text-muted-foreground">
                              {plan.rows
                                .slice(0, 3)
                                .map((row) => row.cells[column.index] || "—")
                                .join(" · ")}
                            </span>
                          </td>
                          <td className="px-2 py-1.5">
                            <Select
                              value={column.role}
                              onValueChange={(next) => {
                                if (!next) return;
                                const role = next as ImportRole;
                                const kind =
                                  role === "income"
                                    ? "INCOME"
                                    : role === "expense"
                                      ? "EXPENSE"
                                      : null;
                                setColumn(column.index, {
                                  role,
                                  categoryId: null,
                                  createCategory: kind
                                });
                              }}
                            >
                              <SelectTrigger
                                className="h-8 w-44"
                                aria-label={`${words.importRole}: ${column.name}`}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {roles.map((role) => (
                                  <SelectItem key={role} value={role}>
                                    {role === "total"
                                      ? words.importTotalCol
                                      : role === "skip"
                                        ? words.importSkip
                                        : words.kinds[role as keyof typeof words.kinds]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-2 py-1.5">
                            {categoryKind ? (
                              <Select
                                value={value}
                                onValueChange={(next) => {
                                  if (!next) return;
                                  setColumn(column.index, {
                                    categoryId: next === CREATE || next === NONE ? null : next,
                                    createCategory: next === CREATE ? categoryKind : null
                                  });
                                }}
                              >
                                <SelectTrigger
                                  className="h-8 w-48"
                                  aria-label={`${words.columnCategory}: ${column.name}`}
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={CREATE}>
                                    {format(words.importCreate, { name: column.name })}
                                  </SelectItem>
                                  <SelectItem value={NONE}>{words.noCategory}</SelectItem>
                                  {categories
                                    .filter((category) => category.kind === categoryKind)
                                    .map((category) => (
                                      <SelectItem key={category.id} value={category.id}>
                                        {category.label}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
            {hasSheet ? (
              <p className="text-xs text-muted-foreground">{words.importReplace}</p>
            ) : null}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {words.cancel}
          </Button>
          <Button type="button" disabled={!payload || busy} onClick={() => void run()}>
            {words.importGo}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
