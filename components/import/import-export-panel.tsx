"use client";

import { Download, FileJson, RotateCcw, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api/client";
import type { ImportPageData, TransactionsPageData } from "@/lib/data";
import { createFileSystemAdapter } from "@/lib/files/createFileSystemAdapter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CsvImportMapper, type CsvColumnMapping } from "@/services/import/CsvImportMapper";
import { ExportService } from "@/services/export/ExportService";

const emptyMapping: CsvColumnMapping = {
  dateColumn: "",
  amountColumn: "",
  descriptionColumn: "",
  categoryColumn: "",
  accountColumn: ""
};

export function ImportExportPanel({
  data,
  transactions
}: {
  data: ImportPageData;
  transactions: TransactionsPageData["transactions"];
}) {
  const [fields, setFields] = useState<string[]>([]);
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [mapping, setMapping] = useState<CsvColumnMapping>(emptyMapping);
  const fileSystem = useMemo(() => createFileSystemAdapter(), []);
  const mapper = useMemo(() => new CsvImportMapper(), []);
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
  }

  async function exportCsv() {
    const content = new ExportService().transactionsToCsv(transactions);
    await fileSystem.saveTextFile("transactions-export.csv", content, "text/csv;charset=utf-8");
  }

  async function exportJson() {
    const content = new ExportService().transactionsToJson(transactions);
    await fileSystem.saveTextFile("transactions-export.json", content, "application/json;charset=utf-8");
  }

  async function downloadTemplate() {
    const content = "Дата,Сумма,Описание,Категория,Счет\n27.05.2026,-1200,Кофе,Рестораны,Дебетовая карта\n28.05.2026,150000,Зарплата,Зарплата,Дебетовая карта";
    await fileSystem.saveTextFile("transactions-import-template.csv", content, "text/csv;charset=utf-8");
  }

  async function exportBackup() {
    try {
      const backup = await apiClient.get<unknown>("/backup");
      const stamp = new Date().toISOString().slice(0, 10);
      await fileSystem.saveTextFile(`financial-assistant-backup-${stamp}.json`, JSON.stringify(backup, null, 2), "application/json;charset=utf-8");
      toast.success("Резервная копия сохранена");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось создать резервную копию");
    }
  }

  async function restoreBackup() {
    const confirmed = window.confirm("Восстановление заменит текущие пользовательские данные содержимым резервной копии. Продолжить?");
    if (!confirmed) return;

    const file = await fileSystem.pickTextFile(".json,application/json");
    if (!file) return;

    try {
      const backup = JSON.parse(file.content) as unknown;
      await apiClient.post("/backup", { backup });
      toast.success("Резервная копия восстановлена");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось восстановить резервную копию");
    }
  }

  async function submitImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());

    try {
      const result = await apiClient.post<{ imported: number; skipped: number }>("/import", payload);
      toast.success(`CSV импортирован: ${result.imported} строк, пропущено: ${result.skipped}`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось импортировать CSV");
    }
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-5 xl:grid-cols-2">
      <Card>
        <CardHeader className="border-b bg-muted/20">
          <CardTitle>Экспорт данных</CardTitle>
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b bg-muted/20">
          <CardTitle>Резервная копия</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-5">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={exportBackup}>
              <Download className="size-4" />
              Скачать backup
            </Button>
            <Button type="button" variant="outline" onClick={restoreBackup}>
              <RotateCcw className="size-4" />
              Восстановить backup
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            JSON backup включает настройки, счета, категории, операции, бюджеты, цели, портфель и watchlist.
          </p>
        </CardContent>
      </Card>
      </section>

      <Card>
        <CardHeader className="border-b bg-muted/20">
          <CardTitle>Импорт CSV</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-5">
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={pickCsv}>
              <Upload className="size-4" />
              Загрузить CSV
            </Button>
            <Button type="button" variant="outline" onClick={downloadTemplate}>
              <Download className="size-4" />
              Шаблон CSV
            </Button>
            <p className="self-center text-sm text-muted-foreground">Поддерживаются колонки даты, суммы, описания, категории и счета.</p>
          </div>

          {errors.length > 0 ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {errors.slice(0, 3).join("; ")}
            </div>
          ) : null}

          {fields.length > 0 ? (
            <form onSubmit={submitImport} className="space-y-4">
              <input type="hidden" name="rows" value={JSON.stringify(rows)} />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <ColumnSelect label="Дата" name="dateColumn" fields={fields} value={mapping.dateColumn} onChange={(value) => setMapping((current) => ({ ...current, dateColumn: value }))} required />
                <ColumnSelect label="Сумма" name="amountColumn" fields={fields} value={mapping.amountColumn} onChange={(value) => setMapping((current) => ({ ...current, amountColumn: value }))} required />
                <ColumnSelect
                  label="Описание"
                  name="descriptionColumn"
                  fields={fields}
                  value={mapping.descriptionColumn}
                  onChange={(value) => setMapping((current) => ({ ...current, descriptionColumn: value }))}
                />
                <ColumnSelect label="Категория" name="categoryColumn" fields={fields} value={mapping.categoryColumn} onChange={(value) => setMapping((current) => ({ ...current, categoryColumn: value }))} />
                <ColumnSelect label="Счет" name="accountColumn" fields={fields} value={mapping.accountColumn} onChange={(value) => setMapping((current) => ({ ...current, accountColumn: value }))} />
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border bg-muted/25 p-3 text-sm">
                  <p className="font-medium">1. Проверьте колонки</p>
                  <p className="mt-1 text-muted-foreground">Дата и сумма обязательны, остальные поля можно оставить пустыми.</p>
                </div>
                <div className="rounded-lg border bg-muted/25 p-3 text-sm">
                  <p className="font-medium">2. Проверьте знак суммы</p>
                  <p className="mt-1 text-muted-foreground">Положительные суммы станут доходами, отрицательные - расходами.</p>
                </div>
                <div className="rounded-lg border bg-muted/25 p-3 text-sm">
                  <p className="font-medium">3. Проверьте справочники</p>
                  <p className="mt-1 text-muted-foreground">Если счет или категория не найдены, будет использован fallback.</p>
                </div>
              </div>
              <div className="rounded-lg border p-3 text-sm">
                <p className="font-medium">Будет импортировано: {validation.validRows} из {rows.length}</p>
                {validation.warnings.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-muted-foreground">
                    {validation.warnings.slice(0, 5).map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <Button type="submit" disabled={validation.validRows === 0}>
                Импортировать операции
              </Button>
            </form>
          ) : null}
        </CardContent>
      </Card>

      {rows.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Предпросмотр строк</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    {fields.slice(0, 6).map((field) => (
                      <TableHead key={field}>{field}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 8).map((row, index) => (
                    <TableRow key={index}>
                      {fields.slice(0, 6).map((field) => (
                        <TableCell key={field}>{String(row[field] ?? "")}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="grid gap-3 md:hidden">
              {rows.slice(0, 8).map((row, index) => (
                <div key={index} className="rounded-lg border p-4 text-sm">
                  {fields.slice(0, 5).map((field) => (
                    <div key={field} className="flex justify-between gap-3 py-1">
                      <span className="text-muted-foreground">{field}</span>
                      <span className="text-right">{String(row[field] ?? "")}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Справочники для импорта</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <p className="font-medium">Счета</p>
            <p className="mt-1 text-muted-foreground">{data.accounts.map((account) => account.name).join(", ")}</p>
          </div>
          <div>
            <p className="font-medium">Категории</p>
            <p className="mt-1 text-muted-foreground">{data.categories.map((category) => category.label).join(", ")}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ColumnSelect({
  label,
  name,
  fields,
  value,
  onChange,
  required
}: {
  label: string;
  name: string;
  fields: string[];
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <select name={name} value={value} onChange={(event) => onChange(event.target.value)} required={required} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
        <option value="">Не выбрано</option>
        {fields.map((field) => (
          <option key={field} value={field}>
            {field}
          </option>
        ))}
      </select>
    </div>
  );
}
