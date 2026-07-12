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
import { useI18n } from "@/lib/i18n/context";
import { createFileSystemAdapter } from "@/lib/files/createFileSystemAdapter";
import { runtimeConfig } from "@/lib/platform/env";
import { useApiPageData } from "@/hooks/use-api-page-data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ALL_OPTION,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
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
    schemaVersion: String(data.schemaVersion ?? "—"),
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
  const { t, locale } = useI18n();
  const { data: pageData, reload: reloadReferences } = useApiPageData(data, "/import");
  const { data: transactionData, reload: reloadTransactions } =
    useApiPageData<TransactionsPageData>(
      {
        source: data.source,
        transactions,
        accounts: data.accounts,
        categories: data.categories,
        rules: [],
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
  // Undo is available on the web (Rule/importBatchId in Postgres) and on the
  // desktop in local-data mode (importBatches in local state).
  const supportsImportUndo =
    runtimeConfig.platform !== "desktop" || runtimeConfig.desktopDataMode === "local";
  const mapper = useMemo(() => new CsvImportMapper(), []);
  const importPresets = useMemo(() => mapper.presets(), [mapper]);
  const validation = useMemo(
    () => mapper.validateRows(rows, mapping, locale),
    [mapper, mapping, rows, locale]
  );
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  // Rows that match an already-stored transaction or repeat earlier in the file.
  const duplicateIndices = useMemo(
    () => mapper.findDuplicateRows(rows, mapping, transactions),
    [mapper, rows, mapping, transactions]
  );
  const router = useRouter();

  async function pickCsv() {
    const file = await fileSystem.pickTextFile(".csv,text/csv");
    if (!file) return;

    const parsed = mapper.parse(file.content);
    setFields(parsed.fields);
    setRows(parsed.rows);
    setErrors(parsed.errors);
    // Auto-apply a detected bank preset (catches bank-specific headers the
    // generic aliases miss); fall back to generic column suggestions.
    const detected = mapper.detectPreset(parsed.fields);
    setMapping(
      detected ? mapper.applyPreset(parsed.fields, detected) : mapper.suggestColumns(parsed.fields)
    );
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
        t("imp.template.header"),
        t("imp.template.row1", { date: fmt(yesterday) }),
        t("imp.template.row2", { date: fmt(today) })
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
      toast.success(t("imp.toast.backupSaved"));
      await reloadReferences();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("imp.toast.backupError"));
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
      toast.error(error instanceof Error ? error.message : t("imp.toast.readError"));
    }
  }

  async function confirmRestoreBackup() {
    if (!restorePayload) {
      toast.error(t("imp.toast.selectFirst"));
      return;
    }

    try {
      setRestorePending(true);
      await apiClient.post("/backup", { backup: restorePayload });
      toast.success(t("imp.toast.restored"));
      setRestoreDialogOpen(false);
      setRestorePayload(null);
      setRestorePreview(null);
      await Promise.all([reloadReferences(), reloadTransactions()]);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("imp.toast.restoreError"));
    } finally {
      setRestorePending(false);
    }
  }

  async function submitImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const rowsToImport =
      skipDuplicates && duplicateIndices.size > 0
        ? rows.filter((_, index) => !duplicateIndices.has(index))
        : rows;
    const payload = {
      rows: JSON.stringify(rowsToImport),
      ...mapping
    };

    try {
      const result = await apiClient.post<{ imported: number; skipped: number }>(
        "/import",
        payload
      );
      toast.success(
        t("imp.toast.imported", { imported: result.imported, skipped: result.skipped })
      );
      setImportStep(1);
      setFields([]);
      setRows([]);
      setMapping(emptyMapping);
      await Promise.all([reloadReferences(), reloadTransactions()]);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("imp.toast.importError"));
    }
  }

  async function undoLastImport() {
    if (!supportsImportUndo) return;

    try {
      setUndoPending(true);
      const result = await apiClient.post<{ removed: number }>("/import/undo", {});
      if (result.removed > 0) {
        toast.success(t("imp.toast.undone", { removed: result.removed }));
      } else {
        toast.info(t("imp.toast.nothingUndo"));
      }
      await Promise.all([reloadReferences(), reloadTransactions()]);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("imp.toast.undoError"));
    } finally {
      setUndoPending(false);
    }
  }

  const stepLabels = [t("imp.step.upload"), t("imp.step.mapping"), t("imp.step.import")] as const;
  const lastBackupLabel = pageData.lastBackupAt
    ? new Date(pageData.lastBackupAt).toLocaleString(locale === "en" ? "en-US" : "ru-RU", {
        dateStyle: "medium",
        timeStyle: "short"
      })
    : t("imp.neverBackup");

  return (
    <div className="space-y-5">
      {/* ── Import Wizard ────────────────────────────────────── */}
      <Card>
        <CardHeader className="border-b bg-muted/20">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>{t("imp.csvTitle")}</CardTitle>
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
              <p className="text-sm text-muted-foreground">{t("imp.intro")}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={pickCsv}
                  className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 p-6 text-center transition-colors hover:border-primary/60 hover:bg-primary/10"
                >
                  <Upload className="size-8 text-primary" />
                  <div>
                    <p className="font-semibold">{t("imp.uploadCsv")}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{t("imp.uploadHint")}</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={downloadTemplate}
                  className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed bg-muted/30 p-6 text-center transition-colors hover:bg-muted/50"
                >
                  <Download className="size-8 text-muted-foreground" />
                  <div>
                    <p className="font-semibold">{t("imp.downloadTemplate")}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{t("imp.templateHint")}</p>
                  </div>
                </button>
              </div>

              {errors.length > 0 && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  {errors.slice(0, 3).join("; ")}
                </div>
              )}

              <div className="rounded-lg border bg-muted/20 p-4">
                <p className="text-sm font-medium">{t("imp.howTitle")}</p>
                <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                  {["imp.how1", "imp.how2", "imp.how3", "imp.how4"].map((key) => (
                    <li key={key} className="flex items-start gap-2">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                      {t(key)}
                    </li>
                  ))}
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
                  {undoPending ? t("imp.undoing") : t("imp.undo")}
                </Button>
              )}
            </div>
          )}

          {/* ── Step 2: Column Mapping ── */}
          {importStep === 2 && fields.length > 0 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {t("imp.mapIntro", { star: "*" })
                  .split("*")
                  .flatMap((part, i) =>
                    i === 0
                      ? [part]
                      : [
                          <span key={i} className="font-semibold text-destructive">
                            *
                          </span>,
                          part
                        ]
                  )}
              </p>
              <div className="rounded-lg border bg-muted/20 p-3">
                <p className="text-sm font-medium">{t("imp.presets")}</p>
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
                    <Label>{t("common.date")}</Label>
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
                      {t("imp.example", { value: String(rows[0][mapping.dateColumn] ?? "—") })}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1">
                    <Label>{t("common.amount")}</Label>
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
                      {t("imp.example", { value: String(rows[0][mapping.amountColumn] ?? "—") })}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>
                    {t("tx.col.description")}{" "}
                    <span className="text-xs text-muted-foreground">{t("imp.optional")}</span>
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
                    {t("common.category")}{" "}
                    <span className="text-xs text-muted-foreground">{t("imp.optional")}</span>
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
                    {t("common.account")}{" "}
                    <span className="text-xs text-muted-foreground">{t("imp.optional")}</span>
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
                  {t("ob.back")}
                </Button>
                <Button
                  type="button"
                  onClick={() => setImportStep(3)}
                  disabled={!mapping.dateColumn || !mapping.amountColumn}
                >
                  {t("ob.next")}
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
                        ? t("imp.readyToImport", {
                            valid: validation.validRows,
                            total: rows.length
                          })
                        : t("imp.noRows")}
                    </p>
                    {rows.length - validation.validRows > 0 && (
                      <p className="text-sm text-muted-foreground">
                        {t("imp.skippedRows", { n: rows.length - validation.validRows })}
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

              {duplicateIndices.size > 0 && (
                <label className="flex items-center gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm">
                  <input
                    type="checkbox"
                    checked={skipDuplicates}
                    onChange={(event) => setSkipDuplicates(event.target.checked)}
                    className="size-4"
                  />
                  <span>{t("imp.dupFound", { count: duplicateIndices.size })}</span>
                </label>
              )}

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
                    {t("imp.moreRows", { n: rows.length - 6 })}
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setImportStep(2)}>
                  {t("ob.back")}
                </Button>
                <Button type="submit" disabled={validation.validRows === 0}>
                  <Upload className="size-4" />
                  {t("imp.importBtn", {
                    n: skipDuplicates
                      ? Math.max(validation.validRows - duplicateIndices.size, 0)
                      : validation.validRows
                  })}
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
            <CardTitle>{t("imp.exportTitle")}</CardTitle>
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
            <p className="self-center text-xs text-muted-foreground">{t("imp.exportHint")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b bg-muted/20">
            <CardTitle>{t("imp.backupTitle")}</CardTitle>
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
                    {pageData.backupReminderDue ? t("imp.backupDue") : t("imp.backupFresh")}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {t("imp.lastBackup", { label: lastBackupLabel })}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={exportBackup}>
                <Download className="size-4" />
                {t("imp.downloadBackup")}
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
                    {t("imp.restoreBackup")}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t("imp.restoreTitle")}</DialogTitle>
                    <DialogDescription>{t("imp.restoreDesc")}</DialogDescription>
                  </DialogHeader>
                  <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                      <p>{t("imp.restoreWarn")}</p>
                    </div>
                  </div>
                  {restorePreview ? (
                    <div className="rounded-lg border bg-muted/20 p-4 text-sm">
                      <p className="font-medium">{t("imp.selectedBackup")}</p>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-muted-foreground">
                        <span>{t("imp.bVersion", { v: restorePreview.schemaVersion })}</span>
                        <span>
                          {t("imp.bDate", {
                            d: restorePreview.exportedAt
                              ? new Date(restorePreview.exportedAt).toLocaleString(
                                  locale === "en" ? "en-US" : "ru-RU"
                                )
                              : t("imp.dateNone")
                          })}
                        </span>
                        <span>{t("imp.bAccounts", { n: restorePreview.accounts })}</span>
                        <span>{t("imp.bCategories", { n: restorePreview.categories })}</span>
                        <span>{t("imp.bTransactions", { n: restorePreview.transactions })}</span>
                        <span>{t("imp.bBudgets", { n: restorePreview.budgets })}</span>
                        <span>{t("imp.bGoals", { n: restorePreview.goals })}</span>
                        <span>
                          {t("imp.bRecurring", { n: restorePreview.recurringTransactions })}
                        </span>
                        <span>{t("imp.bPortfolio", { n: restorePreview.portfolioItems })}</span>
                        <span>{t("imp.bWatchlist", { n: restorePreview.watchlistItems })}</span>
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
                      {t("imp.pickFile")}
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={confirmRestoreBackup}
                      disabled={restorePending || !restorePayload}
                    >
                      {restorePending ? t("imp.restoring") : t("imp.restoreConfirm")}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <p className="text-xs text-muted-foreground">{t("imp.backupIncludes")}</p>
          </CardContent>
        </Card>
      </section>

      {/* ── Reference table ──────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>{t("imp.refTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{t("imp.refAccounts")}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {pageData.accounts.map((a) => (
                <span key={a.id} className="rounded-md border bg-muted/30 px-2 py-0.5 text-xs">
                  {a.name}
                </span>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">{t("imp.refExpenseCats")}</p>
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
  const { t } = useI18n();
  return (
    <Select
      name={name}
      required={required}
      value={value || ALL_OPTION}
      onValueChange={(next) => onChange(next === ALL_OPTION ? "" : next)}
    >
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_OPTION}>{t("imp.notSelected")}</SelectItem>
        {fields.map((field) => (
          <SelectItem key={field} value={field}>
            {field}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
