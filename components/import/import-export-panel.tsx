"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Download,
  FileJson,
  RotateCcw,
  ShieldCheck,
  Upload
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api/client";
import type { ImportPageData, TransactionsPageData } from "@/lib/data";
import { createFileSystemAdapter } from "@/lib/files/createFileSystemAdapter";
import { runtimeConfig } from "@/lib/platform/env";
import { useApiPageData } from "@/hooks/use-api-page-data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { CsvImportMapper, type CsvColumnMapping } from "@/services/import/CsvImportMapper";
import { ExportService } from "@/services/export/ExportService";
import { cn } from "@/lib/utils";

const emptyMapping: CsvColumnMapping = {
  dateColumn: "",
  amountColumn: "",
  descriptionColumn: "",
  categoryColumn: "",
  accountColumn: ""
};

type BackupPreview = {
  schemaVersion: string;
  exportedAt: string | null;
  accounts: number;
  categories: number;
  transactions: number;
  budgets: number;
  goals: number;
  recurringTransactions: number;
  portfolioItems: number;
  watchlistItems: number;
};

function countArray(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

function summarizeBackupPayload(payload: unknown): BackupPreview {
  const data = (typeof payload === "object" && payload !== null ? payload : {}) as Record<
    string,
    unknown
  >;
  const investments = (
    typeof data.investments === "object" && data.investments !== null ? data.investments : {}
  ) as Record<string, unknown>;

  return {
    schemaVersion: String(data.schemaVersion ?? "неизвестно"),
    exportedAt:
      typeof data.exportedAt === "string"
        ? data.exportedAt
        : typeof data.lastBackupAt === "string"
          ? data.lastBackupAt
          : null,
    accounts: countArray(data.accounts),
    categories: countArray(data.categories),
    transactions: countArray(data.transactions),
    budgets: countArray(data.budgets),
    goals: countArray(data.goals) || countArray(data.savingGoals),
    recurringTransactions: countArray(data.recurringTransactions),
    portfolioItems: countArray(investments.portfolio) || countArray(data.portfolios),
    watchlistItems: countArray(investments.watchlist) || countArray(data.watchlist)
  };
}

export function ImportExportPanel({
  data,
  transactions
}: {
  data: ImportPageData;
  transactions: TransactionsPageData["transactions"];
}) {
  const { data: pageData, reload: reloadReferences } = useApiPageData(data, "/import");
  const { data: transactionData, reload: reloadTransactions } =
    useApiPageData<TransactionsPageData>(
      {
        source: data.source,
        transactions,
        accounts: data.accounts,
        categories: data.categories,
        filters: {},
        pagination: {
          page: 1,
          limit: 20,
          total: transactions.length,
          hasPreviousPage: false,
          hasNextPage: false
        }
      },
      "/transactions"
    );
  const [fields, setFields] = useState<string[]>([]);
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [mapping, setMapping] = useState<CsvColumnMapping>(emptyMapping);
  const [restorePending, setRestorePending] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [restorePayload, setRestorePayload] = useState<unknown>(null);
  const [restorePreview, setRestorePreview] = useState<BackupPreview | null>(null);
  const [undoPending, setUndoPending] = useState(false);
  const [importStep, setImportStep] = useState<1 | 2 | 3>(1);
  const fileSystem = useMemo(() => createFileSystemAdapter(), []);
  const supportsImportUndo =
    runtimeConfig.platform === "desktop" && runtimeConfig.desktopDataMode === "local";
  const mapper = useMemo(() => new CsvImportMapper(), []);
  const importPresets = useMemo(() => mapper.presets(), [mapper]);
  const validation = useMemo(() => mapper.validateRows(rows, mapping), [mapper, mapping, rows]);
  const router = useRouter();

  async function pickCsv() {
    const file = await fileSystem.pickTextFile(".csv,text/csv");
    if (!file) return;

    const parsed = mapper.parse(file.content);
    setFields(parsed.fields);
    setRows(parsed.rows);
    setErrors(parsed.errors);
    setMapping(mapper.suggestColumns(parsed.fields));
    if (parsed.fields.length > 0) setImportStep(2);
  }

  async function exportCsv() {
    const content = new ExportService().transactionsToCsv(transactionData.transactions);
    await fileSystem.saveTextFile("transactions-export.csv", content, "text/csv;charset=utf-8");
  }

  async function exportJson() {
    const content = new ExportService().transactionsToJson(transactionData.transactions);
    await fileSystem.saveTextFile(
      "transactions-export.json",
      content,
      "application/json;charset=utf-8"
    );
  }

  async function downloadTemplate() {
    const today = new Date();
    const fmt = (d: Date) =>
      `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const content =
      "﻿" +
      [
        "Дата,Сумма,Описание,Категория,Счет",
        `${fmt(yesterday)},-1200,Кофе,Рестораны,Дебетовая карта`,
        `${fmt(today)},150000,Зарплата,Зарплата,Дебетовая карта`
      ].join("\n");
    await fileSystem.saveTextFile(
      "transactions-import-template.csv",
      content,
      "text/csv;charset=utf-8"
    );
  }

  async function exportBackup() {
    try {
      const backup = await apiClient.get<unknown>("/backup");
      const stamp = new Date().toISOString().slice(0, 10);
      await fileSystem.saveTextFile(
        `financial-assistant-backup-${stamp}.json`,
        JSON.stringify(backup, null, 2),
        "application/json;charset=utf-8"
      );
      toast.success("Резервная копия сохранена");
      await reloadReferences();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось создать резервную копию");
    }
  }

  async function pickBackupForRestore() {
    const file = await fileSystem.pickTextFile(".json,application/json");
    if (!file) return;

    try {
      const backup = JSON.parse(file.content) as unknown;
      setRestorePayload(backup);
      setRestorePreview(summarizeBackupPayload(backup));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось прочитать backup-файл");
    }
  }

  async function confirmRestoreBackup() {
    if (!restorePayload) {
      toast.error("Сначала выберите backup-файл");
      return;
    }

    try {
      setRestorePending(true);
      await apiClient.post("/backup", { backup: restorePayload });
      toast.success("Резервная копия восстановлена");
      setRestoreDialogOpen(false);
      setRestorePayload(null);
      setRestorePreview(null);
      await Promise.all([reloadReferences(), reloadTransactions()]);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Не удалось восстановить резервную копию"
      );
    } finally {
      setRestorePending(false);
    }
  }

  async function submitImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = {
      rows: JSON.stringify(rows),
      ...mapping
    };

    try {
      const result = await apiClient.post<{ imported: number; skipped: number }>(
        "/import",
        payload
      );
      toast.success(`CSV импортирован: ${result.imported} строк, пропущено: ${result.skipped}`);
      setImportStep(1);
      setFields([]);
      setRows([]);
      setMapping(emptyMapping);
      await Promise.all([reloadReferences(), reloadTransactions()]);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось импортировать CSV");
    }
  }

  async function undoLastImport() {
    if (!supportsImportUndo) return;

    try {
      setUndoPending(true);
      const result = await apiClient.post<{ removed: number }>("/import/undo", {});
      if (result.removed > 0) {
        toast.success(`Последний импорт отменен: удалено операций ${result.removed}`);
      } else {
        toast.info("Нет импорта, который можно отменить");
      }
      await Promise.all([reloadReferences(), reloadTransactions()]);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось отменить последний импорт");
    } finally {
      setUndoPending(false);
    }
  }

  const stepLabels = ["Загрузка", "Маппинг", "Импорт"] as const;
  const lastBackupLabel = pageData.lastBackupAt
    ? new Date(pageData.lastBackupAt).toLocaleString("ru-RU", {
        dateStyle: "medium",
        timeStyle: "short"
      })
    : "Пока не создавалась";

  return (
    <div className="space-y-5">
      {/* ── Import Wizard ────────────────────────────────────── */}
      <Card>
        <CardHeader className="border-b bg-muted/20">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Импорт CSV</CardTitle>
            {/* Step indicator */}
            <div className="flex items-center gap-1">
              {stepLabels.map((label, i) => {
                const step = (i + 1) as 1 | 2 | 3;
                const done = step < importStep;
                const active = step === importStep;
                return (
                  <div key={label} className="flex items-center">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "flex size-6 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                          done
                            ? "bg-primary text-primary-foreground"
                            : active
                              ? "border-2 border-primary text-primary"
                              : "border-2 border-muted-foreground/40 text-muted-foreground"
                        )}
                      >
                        {done ? <CheckCircle2 className="size-3.5" /> : step}
                      </span>
                      <span
                        className={cn(
                          "hidden text-xs font-medium sm:block",
                          active ? "text-foreground" : "text-muted-foreground"
                        )}
                      >
                        {label}
                      </span>
                    </div>
                    {i < 2 && <ChevronRight className="mx-1.5 size-3.5 text-muted-foreground/40" />}
                  </div>
                );
              })}
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-5">
          {/* ── Step 1: Source ── */}
          {importStep === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Загрузите файл CSV с вашими транзакциями. Поддерживаются выгрузки большинства
                банков.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={pickCsv}
                  className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 p-6 text-center transition-colors hover:border-primary/60 hover:bg-primary/10"
                >
                  <Upload className="size-8 text-primary" />
                  <div>
                    <p className="font-semibold">Загрузить CSV</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Нажмите, чтобы выбрать файл
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={downloadTemplate}
                  className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed bg-muted/30 p-6 text-center transition-colors hover:bg-muted/50"
                >
                  <Download className="size-8 text-muted-foreground" />
                  <div>
                    <p className="font-semibold">Скачать шаблон</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Пример правильного формата
                    </p>
                  </div>
                </button>
              </div>

              {errors.length > 0 && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  {errors.slice(0, 3).join("; ")}
                </div>
              )}

              <div className="rounded-lg border bg-muted/20 p-4">
                <p className="text-sm font-medium">Как работает импорт:</p>
                <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                    Файл CSV читается локально, данные не передаются на сервер
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                    Колонки даты и суммы обязательны, остальные опциональны
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                    Положительные суммы → доходы, отрицательные → расходы
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                    Дубликаты автоматически пропускаются
                  </li>
                </ul>
              </div>

              {supportsImportUndo && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={undoLastImport}
                  disabled={undoPending}
                >
                  <RotateCcw className="size-4" />
                  {undoPending ? "Отмена..." : "Отменить последний импорт"}
                </Button>
              )}
            </div>
          )}

          {/* ── Step 2: Column Mapping ── */}
          {importStep === 2 && fields.length > 0 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Укажите, какая колонка CSV соответствует каждому полю. Поля, отмеченные{" "}
                <span className="font-semibold text-destructive">*</span>, обязательны.
              </p>
              <div className="rounded-lg border bg-muted/20 p-3">
                <p className="text-sm font-medium">Быстрые пресеты банков</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {importPresets.map((preset) => (
                    <Button
                      key={preset.id}
                      type="button"
                      variant="outline"
                      size="sm"
                      title={preset.description}
                      onClick={() => setMapping(mapper.applyPreset(fields, preset.id))}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1">
                    <Label>Дата</Label>
                    <span className="text-xs font-semibold text-destructive">*</span>
                  </div>
                  <ColumnSelect
                    name="dateColumn"
                    fields={fields}
                    value={mapping.dateColumn}
                    onChange={(v) => setMapping((m) => ({ ...m, dateColumn: v }))}
                    required
                  />
                  {mapping.dateColumn && rows[0] && (
                    <p className="truncate text-xs text-muted-foreground">
                      Пример: {String(rows[0][mapping.dateColumn] ?? "—")}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1">
                    <Label>Сумма</Label>
                    <span className="text-xs font-semibold text-destructive">*</span>
                  </div>
                  <ColumnSelect
                    name="amountColumn"
                    fields={fields}
                    value={mapping.amountColumn}
                    onChange={(v) => setMapping((m) => ({ ...m, amountColumn: v }))}
                    required
                  />
                  {mapping.amountColumn && rows[0] && (
                    <p className="truncate text-xs text-muted-foreground">
                      Пример: {String(rows[0][mapping.amountColumn] ?? "—")}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>
                    Описание <span className="text-xs text-muted-foreground">(необязательно)</span>
                  </Label>
                  <ColumnSelect
                    name="descriptionColumn"
                    fields={fields}
                    value={mapping.descriptionColumn ?? ""}
                    onChange={(v) => setMapping((m) => ({ ...m, descriptionColumn: v }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>
                    Категория <span className="text-xs text-muted-foreground">(необязательно)</span>
                  </Label>
                  <ColumnSelect
                    name="categoryColumn"
                    fields={fields}
                    value={mapping.categoryColumn ?? ""}
                    onChange={(v) => setMapping((m) => ({ ...m, categoryColumn: v }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>
                    Счет <span className="text-xs text-muted-foreground">(необязательно)</span>
                  </Label>
                  <ColumnSelect
                    name="accountColumn"
                    fields={fields}
                    value={mapping.accountColumn ?? ""}
                    onChange={(v) => setMapping((m) => ({ ...m, accountColumn: v }))}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setImportStep(1)}>
                  Назад
                </Button>
                <Button
                  type="button"
                  onClick={() => setImportStep(3)}
                  disabled={!mapping.dateColumn || !mapping.amountColumn}
                >
                  Далее
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )}

          {/* ── Step 3: Review & Import ── */}
          {importStep === 3 && (
            <form onSubmit={submitImport} className="space-y-4">
              <div className="rounded-lg border bg-muted/20 p-4">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "flex size-10 items-center justify-center rounded-full shrink-0",
                      validation.validRows > 0
                        ? "bg-success/15 text-success-foreground"
                        : "bg-destructive/15 text-destructive"
                    )}
                  >
                    {validation.validRows > 0 ? (
                      <CheckCircle2 className="size-5" />
                    ) : (
                      <AlertTriangle className="size-5" />
                    )}
                  </div>
                  <div>
                    <p className="font-semibold">
                      {validation.validRows > 0
                        ? `Готово к импорту: ${validation.validRows} из ${rows.length} строк`
                        : "Нет строк для импорта"}
                    </p>
                    {rows.length - validation.validRows > 0 && (
                      <p className="text-sm text-muted-foreground">
                        Пропущено: {rows.length - validation.validRows} строк (дубликаты или ошибки
                        формата)
                      </p>
                    )}
                  </div>
                </div>
                {validation.warnings.length > 0 && (
                  <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                    {validation.warnings.slice(0, 5).map((w) => (
                      <li key={w} className="truncate">
                        · {w}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="hidden overflow-x-auto rounded-lg border md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {fields.slice(0, 5).map((f) => (
                        <TableHead key={f} className="whitespace-nowrap">
                          {f}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.slice(0, 6).map((row, i) => (
                      <TableRow key={i}>
                        {fields.slice(0, 5).map((f) => (
                          <TableCell key={f} className="max-w-40 truncate text-xs">
                            {String(row[f] ?? "")}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {rows.length > 6 && (
                  <p className="py-2 text-center text-xs text-muted-foreground">
                    и ещё {rows.length - 6} строк...
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setImportStep(2)}>
                  Назад
                </Button>
                <Button type="submit" disabled={validation.validRows === 0}>
                  <Upload className="size-4" />
                  Импортировать {validation.validRows} строк
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      {/* ── Export & Backup ──────────────────────────────────── */}
      <section className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader className="border-b bg-muted/20">
            <CardTitle>Экспорт операций</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 pt-5">
            <Button type="button" variant="outline" onClick={exportCsv}>
              <Download className="size-4" />
              CSV
            </Button>
            <Button type="button" variant="outline" onClick={exportJson}>
              <FileJson className="size-4" />
              JSON
            </Button>
            <p className="self-center text-xs text-muted-foreground">
              Все операции в текущем фильтре
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b bg-muted/20">
            <CardTitle>Резервная копия</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-5">
            <div
              className={cn(
                "rounded-lg border p-4 text-sm",
                pageData.backupReminderDue
                  ? "border-warning/30 bg-warning/10"
                  : "border-success/30 bg-success/10"
              )}
            >
              <div className="flex items-start gap-3">
                {pageData.backupReminderDue ? (
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-foreground" />
                ) : (
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success-foreground" />
                )}
                <div>
                  <p className="font-medium">
                    {pageData.backupReminderDue
                      ? "Пора обновить резервную копию"
                      : "Резервная копия свежая"}
                  </p>
                  <p className="mt-1 text-muted-foreground">Последний backup: {lastBackupLabel}</p>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={exportBackup}>
                <Download className="size-4" />
                Скачать backup
              </Button>
              <Dialog
                open={restoreDialogOpen}
                onOpenChange={(open) => {
                  setRestoreDialogOpen(open);
                  if (!open) {
                    setRestorePayload(null);
                    setRestorePreview(null);
                  }
                }}
              >
                <DialogTrigger asChild>
                  <Button type="button" variant="outline" disabled={restorePending}>
                    <RotateCcw className="size-4" />
                    Восстановить backup
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Восстановить резервную копию?</DialogTitle>
                    <DialogDescription>
                      Текущие данные будут заменены данными из выбранного backup-файла.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                      <p>Сначала скачайте резервную копию текущих данных.</p>
                    </div>
                  </div>
                  {restorePreview ? (
                    <div className="rounded-lg border bg-muted/20 p-4 text-sm">
                      <p className="font-medium">Выбранный backup</p>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-muted-foreground">
                        <span>Версия: {restorePreview.schemaVersion}</span>
                        <span>
                          Дата:{" "}
                          {restorePreview.exportedAt
                            ? new Date(restorePreview.exportedAt).toLocaleString("ru-RU")
                            : "не указана"}
                        </span>
                        <span>Счета: {restorePreview.accounts}</span>
                        <span>Категории: {restorePreview.categories}</span>
                        <span>Операции: {restorePreview.transactions}</span>
                        <span>Бюджеты: {restorePreview.budgets}</span>
                        <span>Цели: {restorePreview.goals}</span>
                        <span>Плановые: {restorePreview.recurringTransactions}</span>
                        <span>Портфель: {restorePreview.portfolioItems}</span>
                        <span>Watchlist: {restorePreview.watchlistItems}</span>
                      </div>
                    </div>
                  ) : null}
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={pickBackupForRestore}
                      disabled={restorePending}
                    >
                      Выбрать и проверить файл
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={confirmRestoreBackup}
                      disabled={restorePending || !restorePayload}
                    >
                      {restorePending ? "Восстановление..." : "Восстановить выбранный backup"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <p className="text-xs text-muted-foreground">
              Включает настройки, счета, категории, операции, бюджеты, цели, портфель и watchlist.
            </p>
          </CardContent>
        </Card>
      </section>

      {/* ── Reference table ──────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Доступные счета и категории</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Счета</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {pageData.accounts.map((a) => (
                <span key={a.id} className="rounded-md border bg-muted/30 px-2 py-0.5 text-xs">
                  {a.name}
                </span>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Категории расходов</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {pageData.categories
                .filter((c) => c.kind === "EXPENSE")
                .slice(0, 12)
                .map((c) => (
                  <span key={c.id} className="rounded-md border bg-muted/30 px-2 py-0.5 text-xs">
                    {c.label}
                  </span>
                ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ColumnSelect({
  name,
  fields,
  value,
  onChange,
  required
}: {
  name: string;
  fields: string[];
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <select
      name={name}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      required={required}
      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
    >
      <option value="">Не выбрано</option>
      {fields.map((field) => (
        <option key={field} value={field}>
          {field}
        </option>
      ))}
    </select>
  );
}
